import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic link lands here with a PKCE `code` param; exchange it for a session
// cookie, then continue to the dashboard.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
