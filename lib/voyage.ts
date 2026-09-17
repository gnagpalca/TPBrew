const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

// The account has no payment method on file, so Voyage caps it at the free
// tier's 3 requests/minute. Rather than pay to raise that limit for a demo,
// space calls out to stay under it and retry (rather than fail) on a 429 —
// slower ingestion, but no dropped chunks/clients.
const MIN_INTERVAL_MS = 21_000;
const MAX_ATTEMPTS = 4;
let lastCallAt = 0;

async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

/**
 * Embeds a batch of text strings via Voyage AI. Used both for client fact
 * narratives (embedded once on create/edit) and news item summaries
 * (embedded once per scraped item) — same model, same vector space, so
 * pgvector cosine similarity between them is meaningful (PRD §4, §8.2).
 */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  let lastError = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await throttle();

    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: "voyage-4-lite",
        input_type: inputType,
        output_dimension: 1024,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data.map((d) => d.embedding);
    }

    lastError = `${res.status} ${await res.text()}`;
    if (res.status !== 429) break;
    // Rate-limited despite throttling (e.g. a prior request from another
    // invocation used up the window) — wait out a full window and retry.
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS));
  }

  throw new Error(`Voyage embeddings request failed: ${lastError}`);
}

export async function embedText(text: string, inputType: "document" | "query" = "document") {
  const [embedding] = await embedTexts([text], inputType);
  return embedding;
}
