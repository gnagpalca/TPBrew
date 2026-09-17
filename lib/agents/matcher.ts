import { anthropic, MODELS } from "@/lib/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, NewsItem, Citation } from "@/lib/types";

// A short news headline/summary and a formal multi-sentence client fact
// narrative are different enough in style that genuinely related pairs
// often score well below a "high confidence" cosine similarity — 0.75 was
// filtering out every candidate before Sonnet ever got to judge them. This
// is deliberately a loose pre-filter (the vector search's job is just to
// avoid running Sonnet over the whole client list); Sonnet's judgeMatch is
// the one actually deciding relevance and catching false positives.
const SIMILARITY_THRESHOLD = 0.3;
const CANDIDATE_LIMIT = 10;
const GROUNDING_CHUNK_LIMIT = 5;

const DECISION_HISTORY_LIMIT = 5;

const SYSTEM_PROMPT = `You are a transfer pricing specialist at a Big 4 firm. You are given a news item, one client's transfer pricing fact pattern, and — where available — excerpts from that client's own TP documentation and from the Malaysia regulatory framework. Decide whether this news is GENUINELY relevant to this specific client — not just topically similar.

A vector search has already flagged this as a plausible candidate; your job is to catch false positives (e.g. news about IP licensing when the client only has intercompany loans, or news about a jurisdiction the client has no operations in) and, for genuine matches, explain why in one sentence a partner could put directly in a client email.

Ground your reasoning in the client's actual TP documentation and the regulatory excerpts when they're provided and relevant — don't just restate the fact narrative. If no document excerpts are provided, or none are relevant, reason from the fact pattern alone.

You may also be shown this manager's recent approve/reject decisions for this same client. Use them to calibrate borderline calls — if they've rejected similar news before (especially with a stated reason), lean against repeating that same call; if they've approved similar news, that's a signal the topic genuinely matters to them. Don't over-index on a single past decision, and never let it override a clear-cut case in either direction.

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

interface PastDecision {
  status: "approved" | "sent" | "rejected";
  email_subject: string | null;
  rejection_reason: string | null;
}

/**
 * The feedback loop: pulls this client's most recent approve/reject
 * decisions so judgeMatch can calibrate to what this specific manager has
 * actually accepted or turned down before, instead of judging every news
 * item from a blank slate every time. A "decision" here is at the level of
 * a weekly draft (a bundle of matches), since that's the only granularity
 * managers currently decide at — there's no per-match approve/reject.
 */
async function getRecentDecisions(supabase: SupabaseClient, clientId: string): Promise<PastDecision[]> {
  const { data } = await supabase
    .from("drafts")
    .select("status, email_subject, rejection_reason")
    .eq("client_id", clientId)
    .in("status", ["approved", "sent", "rejected"])
    .order("decided_at", { ascending: false })
    .limit(DECISION_HISTORY_LIMIT);

  return (data ?? []) as PastDecision[];
}

function formatDecisionHistory(decisions: PastDecision[]): string {
  if (decisions.length === 0) return "(no past decisions yet for this client)";
  return decisions
    .map((d) => {
      if (d.status === "rejected") {
        return `- REJECTED: "${d.email_subject ?? "(untitled)"}" — reason: ${d.rejection_reason || "no reason given"}`;
      }
      return `- APPROVED & SENT: "${d.email_subject ?? "(untitled)"}"`;
    })
    .join("\n");
}

async function judgeMatch(
  client: Client,
  newsItem: NewsItem,
  groundingChunks: GroundingChunk[],
  decisionHistory: PastDecision[]
): Promise<{ relevant: boolean; reasoning: string }> {
  const message = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Client fact pattern (${client.jurisdiction}, ${client.industry ?? "industry unspecified"}):\n${client.fact_narrative}\n\nNews item:\nTitle: ${newsItem.title}\nSummary: ${newsItem.summary}\nJurisdiction relevance: ${(newsItem.jurisdiction_relevance ?? []).join(", ") || "unspecified"}\n\nRelevant excerpts from client TP documentation and Malaysia regulatory framework:\n${formatGroundingContext(groundingChunks)}\n\nThis manager's recent decisions for this client (most recent first):\n${formatDecisionHistory(decisionHistory)}`,
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

    const [groundingChunks, decisionHistory] = await Promise.all([
      retrieveGroundingChunks(supabase, candidate, newsItem),
      getRecentDecisions(supabase, candidate.id),
    ]);
    const judgment = await judgeMatch(candidate, newsItem, groundingChunks, decisionHistory);
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
