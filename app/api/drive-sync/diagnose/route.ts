import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeMeta(value: string | undefined, expectedPrefix?: string) {
  if (!value) return { present: false };
  return {
    present: true,
    length: value.length,
    startsWithExpected: expectedPrefix ? value.startsWith(expectedPrefix) : undefined,
    firstChars: value.slice(0, 6),
    lastChars: value.slice(-10),
    // catches copy/paste artifacts that silently break the value
    hasWhitespaceOrNewline: /\s/.test(value),
  };
}

/**
 * Diagnoses Drive OAuth config without guessing: reports whether each env
 * var is actually present/well-formed (without exposing full secrets), and
 * makes a raw call directly to Google's token endpoint to surface the
 * FULL error_description Google returns — the googleapis library's
 * wrapped error only exposes a terse "invalid_client" string, which isn't
 * enough to tell a bad client_id/secret pair apart from a dozen other
 * causes.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  const envReport = {
    GOOGLE_OAUTH_CLIENT_ID: safeMeta(clientId, undefined),
    GOOGLE_OAUTH_CLIENT_ID_endsWithExpectedSuffix: clientId?.endsWith(".apps.googleusercontent.com") ?? false,
    GOOGLE_OAUTH_CLIENT_SECRET: safeMeta(clientSecret, "GOCSPX-"),
    GOOGLE_OAUTH_REFRESH_TOKEN: safeMeta(refreshToken, "1//"),
    GOOGLE_DRIVE_ROOT_FOLDER_ID: rootFolderId ?? null,
  };

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({ envReport, tokenExchange: "skipped — one or more vars missing" });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const bodyText = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }

  return NextResponse.json({
    envReport,
    tokenExchange: { httpStatus: res.status, body },
  });
}
