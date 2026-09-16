import { anthropic, MODELS } from "@/lib/anthropic";
import type { ScrapedItem } from "@/lib/types";
import type { RawItem } from "@/lib/agents/fetchers";

const SYSTEM_PROMPT = `You clean and classify raw tax/transfer-pricing news content for a Big 4 transfer pricing team covering Southeast Asian clients.

Rules:
- Never copy sentences verbatim from the source. Summarize entirely in your own words.
- The summary must be 2-3 sentences, factual, no speculation.
- If the content is NOT relevant to transfer pricing or international tax (e.g. unrelated site navigation, an ad, a non-tax article), respond with exactly {"relevant": false} and nothing else.
- Otherwise respond with strict JSON matching this shape and nothing else:
{"relevant": true, "title": string, "summary": string, "topic_tags": string[], "jurisdiction_relevance": string[], "published_date": string | null}

topic_tags: short lowercase phrases, e.g. "intra-group services", "management fees", "APA", "BEPS pillar two", "IP licensing", "manufacturing structure", "intercompany loans".
jurisdiction_relevance: country names or "OECD-wide" / "global" if not country-specific.
published_date: ISO 8601 date (YYYY-MM-DD) if determinable from the content, else null.

Respond with ONLY the JSON object. No markdown fences, no commentary.`;

function parseJsonResponse(text: string): ScrapedItem {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "");
  return JSON.parse(cleaned) as ScrapedItem;
}

export async function cleanAndClassify(item: RawItem): Promise<ScrapedItem> {
  const message = await anthropic.messages.create({
    model: MODELS.haiku,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Title: ${item.title}\nPublished (if known): ${item.publishedDate ?? "unknown"}\n\nRaw content:\n${item.rawContent.slice(0, 6000)}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { relevant: false };
  }

  try {
    return parseJsonResponse(textBlock.text);
  } catch {
    // Malformed JSON from the model — drop the item rather than crash the run.
    return { relevant: false };
  }
}
