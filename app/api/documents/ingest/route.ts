import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestDocument } from "@/lib/documents";
import type { DocumentCategory } from "@/lib/types";

// Manual ingestion path for RAG source documents: paste text for a client's
// TP documents or a Malaysia regulatory framework reference. Same
// chunk/embed/store function a future Google Drive sync would call — this
// just supplies the text directly instead of pulling it from Drive.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { category, client_id, title, jurisdiction, source_ref, text } = body as {
    category?: DocumentCategory;
    client_id?: string;
    title?: string;
    jurisdiction?: string;
    source_ref?: string;
    text?: string;
  };

  if (!category || !["client_tp_doc", "regulatory_framework"].includes(category)) {
    return NextResponse.json({ error: "category must be 'client_tp_doc' or 'regulatory_framework'" }, { status: 400 });
  }
  if (!title || !text) {
    return NextResponse.json({ error: "title and text are required" }, { status: 400 });
  }
  if (category === "client_tp_doc" && !client_id) {
    return NextResponse.json({ error: "client_id is required for client_tp_doc" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (category === "client_tp_doc") {
    // Confirm this manager actually owns the client before letting them
    // attach a TP document to it — RLS would block a raw select of someone
    // else's client, so a null result here means either it doesn't exist
    // or isn't theirs.
    const { data: client } = await supabase.from("clients").select("id").eq("id", client_id).maybeSingle();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const result = await ingestDocument(admin, {
    category,
    clientId: category === "client_tp_doc" ? client_id! : null,
    title,
    jurisdiction: jurisdiction ?? (category === "regulatory_framework" ? "Malaysia" : null),
    sourceRef: source_ref ?? null,
    text,
  });

  return NextResponse.json(result);
}
