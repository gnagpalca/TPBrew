import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Edits draft content before approval. Uses the RLS-scoped client so a
// manager can only touch drafts assigned to them (see drafts_update_own
// policy in supabase/schema.sql) — no manual ownership check needed here.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { email_subject, email_body } = body as { email_subject?: string; email_body?: string };

  if (!email_subject && !email_body) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drafts")
    .update({
      ...(email_subject ? { email_subject } : {}),
      ...(email_body ? { email_body } : {}),
    })
    .eq("id", id)
    .eq("status", "pending") // no editing after a decision has been made
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Draft not found or not editable" }, { status: 404 });
  }

  return NextResponse.json(data);
}
