import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFromDrive } from "@/lib/agents/drive-sync";

export const maxDuration = 300; // extraction + summarization + embedding across many files

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    return NextResponse.json({ error: "GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured" }, { status: 500 });
  }

  const admin = createAdminClient();

  try {
    const result = await syncFromDrive(admin, rootFolderId, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Drive sync failed" },
      { status: 500 }
    );
  }
}
