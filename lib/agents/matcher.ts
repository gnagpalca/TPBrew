import { anthropic, MODELS } from "@/lib/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, NewsItem, Citation } from "@/lib/types";

const SIMILARITY_THRESHOLD = 0.75;
const CANDIDATE_LIMIT = 10;
const GROUNDING_CHUNK_LIMIT = 5;

const SYSTEM_PROMPT = `You are a transfer pricing specialist at a Big 4 firm. You are given a news item, one client's transfer pricing fact pattern, and — where available — excerpts from that client's own TP documentation and from the Malaysia regulatory framework. Decide whether this news is GENUINELY relevant to this specific client — not just topically similar.

A vector search has already flagged this as a plausible candidate; your job is to catch false positives (e.g. news about IP licensing when the client only has intercompany loans, or news about a jurisdiction the client has no operations in) and, for genuine matches, explain why in one sentence a partner could put directly in a client email.

Ground your reasoning in the client's actual TP documentation and the regulatory excerpts when they're provided and relevant — don't just restate the fact narrative. If no document excerpts are provided, or none are relevant, reason from the fact pattern alone.

Respond with strict JSON only, no markdown fences:
{"relevant": boolean, "reasoning": string}

reasoning: if relevant, one sentence starting with "This matters to you because..." referencing the client's specific fact pattern (and TP documentation/regulation where it genuinely informed the judgment). If not relevant, a brief internal note on why it was rejected.`;

interface CandidateRow extends Client {
  similarity: number;
}

interface GroundingChunk {
  id: string;
  document_source_id: string;
  title: string;
  content: string;
  similarity: number;
}

function jurisdictionApplies(client: Client, newsJurisdictions: string[] | null): boolean {
  if (!newsJurisdictions || newsJurisdictions.length === 0) return true;
  const globalMarkers = ["oecd-wide", "global", "oecd"];
  return newsJurisdictions.some(
    (j) => globalMarkers.includes(j.toLowerCase()) || j.toLowerCase() === client.jurisdiction.toLowerCase()
  );
}

/**
 * Retrieves grounding context for the TP specialist's judgment (the RAG
 * layer): the client's own TP documentation plus Malaysia regulatory
 * framework excerpts relevant to this news item's embedding. Either set can
 * be empty if nothing's been ingested yet — the agent falls back to the
 * fact narrative alone in that case.
 */
async function retrieveGroundingChunks(
  supabase: SupabaseClient,
  client: Client,
  newsItem: NewsItem
): Promise<GroundingChunk[]> {
  const [clientDocs, regulatoryDocs] = await Promise.all([
    supabase.rpc("match_document_chunks", {
      query_embedding: newsItem.embedding,
      match_category: "client_tp_doc",
      match_client_id: client.id,
      match_jurisdiction: null,
      match_count: GROUNDING_CHUNK_LIMIT,
    }),
    supabase.rpc("match_document_chunks", {
      query_embedding: newsItem.embedding,
      match_category: "regulatory_framework",
      match_client_id: null,
      match_jurisdiction: client.jurisdiction,
      match_count: GROUNDING_CHUNK_LIMIT,
    }),
  ]);

  return [...(clientDocs.data ?? []), ...(regulatoryDocs.data ?? [])] as GroundingChunk[];
}

function formatGroundingContext(chunks: GroundingChunk[]): string {
  if (chunks.length === 0) return "(no client documentation or regulatory excerpts available)";
  return chunks.map((c, i) => `[${i + 1}] ${c.title}:\n${c.content}`).join("\n\n");
}

async function judgeMatch(
  client: Client,
  newsItem: NewsItem,
  groundingChunks: GroundingChunk[]
): Promise<{ relevant: boolean; reasoning: string }> {
  const message = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Client fact pattern (${client.jurisdiction}, ${client.industry ?? "industry unspecified"}):\n${client.fact_narrative}\n\nNews item:\nTitle: ${newsItem.title}\nSummary: ${newsItem.summary}\nJurisdiction relevance: ${(newsItem.jurisdiction_relevance ?? []).join(", ") || "unspecified"}\n\nRelevant excerpts from client TP documentation and Malaysia regulatory framework:\n${formatGroundingContext(groundingChunks)}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return { relevant: false, reasoning: "" };

  try {
    const cleaned = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    return JSON.parse(cleaned);
  } catch {
    return { relevant: false, reasoning: "" };
  }
}

/**
 * Runs the TP specialist matching step for one news item against all
 * clients (PRD §8.3): pgvector similarity search, jurisdiction pre-filter,
 * RAG retrieval over client TP docs + Malaysia regulatory framework, then
 * Sonnet judgment grounded in that material. Writes accepted matches
 * (with citations for orchestrator/manager auditability) and returns how
 * many were written.
 */
export async function matchNewsItem(supabase: SupabaseClient, newsItem: NewsItem): Promise<number> {
  if (!newsItem.embedding) return 0;

  const { data: candidates, error } = await supabase.rpc("match_clients", {
    query_embedding: newsItem.embedding,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: CANDIDATE_LIMIT,
  });

  if (error) throw error;
  if (!candidates || candidates.length === 0) return 0;

  let matchedCount = 0;

  for (const candidate of candidates as CandidateRow[]) {
    if (!jurisdictionApplies(candidate, newsItem.jurisdiction_relevance)) continue;

    // No unique constraint on (news_item_id, client_id) — guard here so this
    // is safe to call more than once for the same item (e.g. a manual
    // re-match after new clients are added), instead of stacking duplicate
    // matches/drafts each time.
    const { data: existingMatch } = await supabase
      .from("matches")
      .select("id")
      .eq("news_item_id", newsItem.id)
      .eq("client_id", candidate.id)
      .maybeSingle();
    if (existingMatch) {
      matchedCount++;
      continue;
    }

    const groundingChunks = await retrieveGroundingChunks(supabase, candidate, newsItem);
    const judgment = await judgeMatch(candidate, newsItem, groundingChunks);
    if (!judgment.relevant) continue;

    const citations: Citation[] = groundingChunks.map((c) => ({
      document_chunk_id: c.id,
      document_title: c.title,
      snippet: c.content.slice(0, 240),
    }));

    const { error: insertError } = await supabase.from("matches").insert({
      news_item_id: newsItem.id,
      client_id: candidate.id,
      relevance_score: candidate.similarity,
      reasoning: judgment.reasoning,
      citations: citations.length > 0 ? citations : null,
    });

    if (!insertError) matchedCount++;
  }

  return matchedCount;
}
