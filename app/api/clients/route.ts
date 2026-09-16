import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/voyage";

// Creates a client owned by the signed-in manager. The fact_narrative is
// embedded here (server-side, needs VOYAGE_API_KEY) so matching works
// immediately on the next agent run — this is what drives match quality
// (PRD §10).
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, jurisdiction, industry, fact_narrative } = body as {
    name?: string;
    jurisdiction?: string;
    industry?: string;
    fact_narrative?: string;
  };

  if (!name || !jurisdiction || !fact_narrative) {
    return NextResponse.json({ error: "name, jurisdiction, and fact_narrative are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fact_embedding = await embedText(fact_narrative);

  const { data, error } = await supabase
    .from("clients")
    .insert({ name, jurisdiction, industry, fact_narrative, fact_embedding, manager_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
