import type { SupabaseClient } from "@supabase/supabase-js";
import { findSubfolder, listFilesInFolder, downloadFileBuffer, type DriveFile } from "@/lib/google-drive";
import { extractText } from "@/lib/extract-text";
import { ingestDocument } from "@/lib/documents";
import { splitIntoChapters } from "@/lib/chapter-split";
import { embedText } from "@/lib/voyage";
import { anthropic, MODELS } from "@/lib/anthropic";

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Stay comfortably under the route's maxDuration (300s) so a run that can't
// finish returns a clean partial result instead of a hard timeout — the
// caller just clicks sync again to continue from the next chapter/file.
const FRAMEWORK_TIME_BUDGET_MS = 250_000;

function guessJurisdiction(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("malaysia") || t.includes("akta") || t.includes("lhdn") || t.includes("form c")) return "Malaysia";
  return "OECD-wide";
}

async function alreadyIngested(supabase: SupabaseClient, sourceRef: string): Promise<boolean> {
  const { data } = await supabase.from("document_sources").select("id").eq("source_ref", sourceRef).maybeSingle();
  return !!data;
}

async function askSonnetJson<T>(systemPrompt: string, userContent: string): Promise<T | null> {
  const message = await anthropic.messages.create({
    model: MODELS.sonnet,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  try {
    const cleaned = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export interface FrameworkSyncResult {
  chaptersIngested: number;
  filesFullyProcessed: number;
  skipped: number;
  ranOutOfTime: boolean;
  errors: string[];
}

/**
 * Syncs the "TP Framework" subfolder. Each detected chapter/part within a
 * PDF becomes its own document_source with a unique source_ref
 * (`${fileId}#${chapterIndex}`), so a run that hits the time budget resumes
 * at the next unprocessed chapter on the next call instead of restarting a
 * huge document (e.g. the OECD/UN manuals) from scratch.
 */
export async function syncFrameworkDocs(supabase: SupabaseClient, rootFolderId: string): Promise<FrameworkSyncResult> {
  const result: FrameworkSyncResult = {
    chaptersIngested: 0,
    filesFullyProcessed: 0,
    skipped: 0,
    ranOutOfTime: false,
    errors: [],
  };
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > FRAMEWORK_TIME_BUDGET_MS;

  const frameworkFolderId = await findSubfolder(rootFolderId, "TP Framework");
  if (!frameworkFolderId) {
    result.errors.push('No "TP Framework" subfolder found under the given root folder');
    return result;
  }

  const files = await listFilesInFolder(frameworkFolderId);

  for (const file of files) {
    if (outOfTime()) {
      result.ranOutOfTime = true;
      break;
    }

    try {
      if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
        result.skipped++;
        continue;
      }

      const buffer = await downloadFileBuffer(file.id);
      const text = await extractText(buffer, file.mimeType);
      const chapters = splitIntoChapters(text, file.name);

      let fileFullyDone = true;
      for (let i = 0; i < chapters.length; i++) {
        if (outOfTime()) {
          result.ranOutOfTime = true;
          fileFullyDone = false;
          break;
        }

        const chapterSourceRef = `${file.id}#${i}`;
        if (await alreadyIngested(supabase, chapterSourceRef)) {
          result.skipped++;
          continue;
        }

        const chapterTitle = chapters.length > 1 ? `${file.name} — ${chapters[i].title}` : file.name;
        await ingestDocument(supabase, {
          category: "regulatory_framework",
          clientId: null,
          title: chapterTitle,
          jurisdiction: guessJurisdiction(file.name),
          sourceRef: chapterSourceRef,
          text: chapters[i].text,
        });
        result.chaptersIngested++;
      }

      if (fileFullyDone) result.filesFullyProcessed++;
      if (result.ranOutOfTime) break;
    } catch (err) {
      result.errors.push(`Framework file "${file.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

export interface ClientSyncResult {
  clientsCreated: number;
  clientDocsIngested: number;
  skipped: number;
  errors: string[];
}

/**
 * Syncs the "Client data" subfolder: groups files by taxpayer name (Sonnet
 * extracts it per file), auto-creates a client from a synthesized profile
 * if one doesn't already exist by that name, then ingests each file as a
 * client_tp_doc tied to that client. Idempotent per file via source_ref.
 */
export async function syncClientData(
  supabase: SupabaseClient,
  rootFolderId: string,
  managerId: string
): Promise<ClientSyncResult> {
  const result: ClientSyncResult = { clientsCreated: 0, clientDocsIngested: 0, skipped: 0, errors: [] };

  const clientFolderId = await findSubfolder(rootFolderId, "Client data");
  if (!clientFolderId) {
    result.errors.push('No "Client data" subfolder found under the given root folder');
    return result;
  }

  const files = await listFilesInFolder(clientFolderId);
  const newFiles: { file: DriveFile; text: string }[] = [];

  for (const file of files) {
    try {
      if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
        result.skipped++;
        continue;
      }
      if (await alreadyIngested(supabase, file.id)) {
        result.skipped++;
        continue;
      }
      const buffer = await downloadFileBuffer(file.id);
      const text = await extractText(buffer, file.mimeType);
      newFiles.push({ file, text });
    } catch (err) {
      result.errors.push(`Client file "${file.name}" failed to read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Identify which taxpayer each new file belongs to, then group.
  const groups = new Map<string, { file: DriveFile; text: string }[]>();
  for (const item of newFiles) {
    const extracted = await askSonnetJson<{ client_name: string }>(
      'Identify the taxpayer/client company name this transfer pricing document is about. Respond with strict JSON only: {"client_name": string}. Use the full legal name as it appears in the document.',
      item.text.slice(0, 4000)
    );
    const key = (extracted?.client_name ?? item.file.name).trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  for (const [, groupFiles] of groups) {
    try {
      const canonicalName = (
        await askSonnetJson<{ client_name: string }>(
          'Identify the taxpayer/client company name this transfer pricing document is about. Respond with strict JSON only: {"client_name": string}.',
          groupFiles[0].text.slice(0, 4000)
        )
      )?.client_name;
      if (!canonicalName) {
        result.errors.push(`Could not determine client name for file "${groupFiles[0].file.name}"`);
        continue;
      }

      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .ilike("name", canonicalName)
        .maybeSingle();

      let clientId = existingClient?.id as string | undefined;

      if (!clientId) {
        const combinedText = groupFiles.map((g) => g.text).join("\n\n---\n\n").slice(0, 12000);
        const profile = await askSonnetJson<{ jurisdiction: string; industry: string; fact_narrative: string }>(
          `You are onboarding a new transfer pricing client from their TP documentation. Extract a concise profile.

Respond with strict JSON only:
{"jurisdiction": string, "industry": string, "fact_narrative": string}

fact_narrative: 4-8 sentences covering the taxpayer's characterisation/role, its group structure, and its key related-party transactions (counterparties, jurisdictions, pricing policies) — specific enough to judge whether a piece of TP/tax news is relevant to this client.`,
          combinedText
        );

        if (!profile) {
          result.errors.push(`Could not extract a profile for client "${canonicalName}"`);
          continue;
        }

        const fact_embedding = await embedText(profile.fact_narrative);
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert({
            name: canonicalName,
            jurisdiction: profile.jurisdiction,
            industry: profile.industry,
            fact_narrative: profile.fact_narrative,
            fact_embedding,
            manager_id: managerId,
          })
          .select("id")
          .single();

        if (clientError || !newClient) {
          result.errors.push(`Could not create client "${canonicalName}": ${clientError?.message}`);
          continue;
        }
        clientId = newClient.id;
        result.clientsCreated++;
      }

      for (const { file, text } of groupFiles) {
        await ingestDocument(supabase, {
          category: "client_tp_doc",
          clientId: clientId!,
          title: file.name,
          jurisdiction: null,
          sourceRef: file.id,
          text,
        });
        result.clientDocsIngested++;
      }
    } catch (err) {
      result.errors.push(`Client group failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
