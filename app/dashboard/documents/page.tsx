import { createClient } from "@/lib/supabase/server";
import DocumentForm from "./document-form";
import DriveSyncButton from "./drive-sync-button";
import type { DocumentSource } from "@/lib/types";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: documents }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase
      .from("document_sources")
      .select("*, clients(name)")
      .order("created_at", { ascending: false }),
  ]);

  const regulatory = (documents ?? []).filter((d) => d.category === "regulatory_framework");
  const clientDocs = (documents ?? []).filter((d) => d.category === "client_tp_doc");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Reference documents</h1>
          <p className="text-sm text-zinc-500">
            The TP specialist agent grounds its matching and reasoning in these documents — client TP documentation
            and the Malaysia regulatory framework — instead of relying only on the short fact narrative.
          </p>
        </div>
        <DriveSyncButton />
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
        <p className="mb-1 text-sm font-medium">Ingest a document manually</p>
        <p className="mb-3 text-xs text-zinc-500">
          Prefer &ldquo;Sync from Drive&rdquo; above for bulk import — use this for a one-off addition.
        </p>
        <DocumentForm clients={clients ?? []} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Malaysia regulatory framework</p>
          <div className="flex flex-col gap-2">
            {regulatory.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-950"
              >
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-zinc-500">{doc.jurisdiction}</p>
              </div>
            ))}
            {regulatory.length === 0 && (
              <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-zinc-500 dark:border-white/10">
                None yet.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Client TP documents</p>
          <div className="flex flex-col gap-2">
            {(clientDocs as (DocumentSource & { clients: { name: string } | null })[]).map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-950"
              >
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-zinc-500">{doc.clients?.name ?? "Unknown client"}</p>
              </div>
            ))}
            {clientDocs.length === 0 && (
              <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-xs text-zinc-500 dark:border-white/10">
                None yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
