import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };

  // The reason (if given) is fed back into future matching for this client
  // (see lib/agents/matcher.ts) so the agent calibrates to why this
  // specific call was rejected, not just that it was.
  const { data, error } = await supabase
    .from("drafts")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      rejection_reason: reason?.trim() || null,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Draft not found or already decided" }, { status: 404 });
  }

  return NextResponse.json(data);
}
