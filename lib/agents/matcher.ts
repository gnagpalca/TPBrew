import { anthropic, MODELS } from "@/lib/anthropic";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, NewsItem } from "@/lib/types";

const SIMILARITY_THRESHOLD = 0.75;
const CANDIDATE_LIMIT = 10;

const SYSTEM_PROMPT = `You are a transfer pricing specialist at a Big 4 firm. You are given a news item and one client's transfer pricing fact pattern. Decide whether this news is GENUINELY relevant to this specific client — not just topically similar.

A vector search has already flagged this as a plausible candidate; your job is to catch false positives (e.g. news about IP licensing when the client only has intercompany loans, or news about a jurisdiction the client has no operations in) and, for genuine matches, explain why in one sentence a partner could put directly in a client email.

Respond with strict JSON only, no markdown fences:
{"relevant": boolean, "reasoning": string}

reasoning: if relevant, one sentence starting with "This matters to you because..." referencing the client's specific fact pattern. If not relevant, a brief internal note on why it was rejected.`;

interface CandidateRow extends Client {
  similarity: number;
}

function jurisdictionApplies(client: Client, newsJurisdictions: string[] | null): boolean {
  if (!newsJurisdictions || newsJurisdictions.length === 0) return true;
  const globalMarkers = ["oecd-wide", "global", "oecd"];
  return newsJurisdictions.some(
    (j) => globalMarkers.includes(j.toLowerCase()) || j.toLowerCase() === client.jurisdiction.toLowerCase()
  );
}

async function judgeMatch(client: Client, newsItem: NewsItem): Promise<{ relevant: boolean; reasoning: string }> {
  const message = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Client fact pattern (${client.jurisdiction}, ${client.industry ?? "industry unspecified"}):\n${client.fact_narrative}\n\nNews item:\nTitle: ${newsItem.title}\nSummary: ${newsItem.summary}\nJurisdiction relevance: ${(newsItem.jurisdiction_relevance ?? []).join(", ") || "unspecified"}`,
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
 * then Sonnet judgment on remaining candidates. Writes accepted matches
 * and returns how many were written.
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

    const judgment = await judgeMatch(candidate, newsItem);
    if (!judgment.relevant) continue;

    const { error: insertError } = await supabase.from("matches").insert({
      news_item_id: newsItem.id,
      client_id: candidate.id,
      relevance_score: candidate.similarity,
      reasoning: judgment.reasoning,
    });

    if (!insertError) matchedCount++;
  }

  return matchedCount;
}
