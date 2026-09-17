import { createClient } from "@/lib/supabase/server";
import DraftCard from "./draft-card";

export default async function DraftsPage() {
  const supabase = await createClient();

  const { data: drafts } = await supabase
    .from("drafts")
    .select("*, clients(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Pending drafts</h1>
      <p className="text-sm text-muted">
        Nothing reaches a client until you approve it here — approving sends immediately.
      </p>

      <div className="flex flex-col gap-4">
        {(drafts ?? []).map((draft) => (
          <DraftCard
            key={draft.id}
            id={draft.id}
            clientName={(draft.clients as unknown as { name: string } | null)?.name ?? "Unknown client"}
            matchCount={draft.match_ids?.length ?? 0}
            emailSubject={draft.email_subject}
            emailBody={draft.email_body}
          />
        ))}
        {(!drafts || drafts.length === 0) && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            No pending drafts. Run the agent to generate this week&rsquo;s drafts.
          </p>
        )}
      </div>
    </div>
  );
}
