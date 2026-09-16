import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/resend";

// Approving is the ONLY path that results in a client email going out (PRD
// §3, §8.5) — there is no other route or flag that sends to a client.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS (drafts_update_own) ensures this only succeeds for the draft's own
  // manager; the .eq("status", "pending") guard stops double-sends.
  const { data: draft, error } = await supabase
    .from("drafts")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("*, clients(name, id)")
    .single();

  if (error || !draft) {
    return NextResponse.json({ error: error?.message ?? "Draft not found or already decided" }, { status: 404 });
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("email, name")
    .eq("client_id", draft.client_id);

  const recipients = (contacts ?? []).map((c) => c.email).filter(Boolean);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Draft approved but no client contacts on file — nothing was sent. Add a contact and resend manually." },
      { status: 200 }
    );
  }

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: draft.email_subject,
    text: draft.email_body,
  });

  await supabase.from("drafts").update({ status: "sent" }).eq("id", id);

  return NextResponse.json({ ...draft, status: "sent" });
}
