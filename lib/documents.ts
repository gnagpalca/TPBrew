import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/voyage";
import type { DocumentCategory } from "@/lib/types";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH_SIZE = 20;

/**
 * Splits text into overlapping chunks, preferring paragraph boundaries so a
 * chunk doesn't cut a sentence in half where avoidable. Good enough for TP
 * memos and regulatory text — no need for a heavier splitter at this scale.
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > chunkSize && current) {
      chunks.push(current);
      // start the next chunk with the tail of the previous one for overlap
      current = current.slice(Math.max(0, current.length - overlap));
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;

    while (current.length > chunkSize) {
      chunks.push(current.slice(0, chunkSize));
      current = current.slice(chunkSize - overlap);
    }
  }
  if (current.trim()) chunks.push(current);

  return chunks;
}

interface IngestDocumentInput {
  category: DocumentCategory;
  clientId: string | null;
  title: string;
  jurisdiction: string | null;
  sourceRef: string | null;
  text: string;
}

/**
 * Chunks, embeds, and stores a document for RAG retrieval by the TP
 * specialist agent (matcher.ts). `supabase` must be a service-role client —
 * this bypasses RLS by design, same as the rest of the agent pipeline.
 */
export async function ingestDocument(supabase: SupabaseClient, input: IngestDocumentInput) {
  const { category, clientId, title, jurisdiction, sourceRef, text } = input;

  const { data: source, error: sourceError } = await supabase
    .from("document_sources")
    .insert({ category, client_id: clientId, title, jurisdiction, source_ref: sourceRef })
    .select()
    .single();

  if (sourceError || !source) throw sourceError ?? new Error("Failed to create document source");

  const chunks = chunkText(text);
  if (chunks.length === 0) return { sourceId: source.id, chunkCount: 0 };

  let stored = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedTexts(batch);

    const rows = batch.map((content, j) => ({
      document_source_id: source.id,
      category,
      client_id: clientId,
      jurisdiction,
      chunk_index: i + j,
      content,
      embedding: embeddings[j],
    }));

    const { error: chunkError } = await supabase.from("document_chunks").insert(rows);
    if (chunkError) throw chunkError;
    stored += rows.length;
  }

  return { sourceId: source.id, chunkCount: stored };
}
