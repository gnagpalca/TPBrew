const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";

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

  if (!res.ok) {
    throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embedText(text: string, inputType: "document" | "query" = "document") {
  const [embedding] = await embedTexts([text], inputType);
  return embedding;
}
