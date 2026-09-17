import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClientData, syncFrameworkDocs } from "@/lib/agents/drive-sync";

export const maxDuration = 300; // extraction + summarization + embedding across many files

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    return NextResponse.json({ error: "GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured" }, { status: 500 });
  }

  const { target } = (await request.json().catch(() => ({}))) as { target?: "clients" | "framework" };
  const admin = createAdminClient();

  try {
    if (target === "framework") {
      const result = await syncFrameworkDocs(admin, rootFolderId);
      return NextResponse.json(result);
    }
    // Default to clients — the fast path, and the one that unblocks
    // matching/drafting immediately.
    const result = await syncClientData(admin, rootFolderId, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drive sync failed" },
      { status: 500 }
    );
  }
}
