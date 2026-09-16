import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/voyage";

// Updates a client's fact pattern. Re-embeds whenever fact_narrative
// changes, since the embedding is what actually drives match quality.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { name, jurisdiction, industry, fact_narrative } = body as {
    name?: string;
    jurisdiction?: string;
    industry?: string;
    fact_narrative?: string;
  };

  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (name) update.name = name;
  if (jurisdiction) update.jurisdiction = jurisdiction;
  if (industry !== undefined) update.industry = industry;
  if (fact_narrative) {
    update.fact_narrative = fact_narrative;
    update.fact_embedding = await embedText(fact_narrative);
  }

  const { data, error } = await supabase.from("clients").update(update).eq("id", id).select().single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Client not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
