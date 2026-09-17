import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { matchNewsItem } from "@/lib/agents/matcher";
import { generateDraftsForPendingMatches } from "@/lib/agents/draft";
import type { NewsItem } from "@/lib/types";

export const maxDuration = 120;

/**
 * Re-runs client matching over already-scraped news items instead of only
 * ever matching a news item once at scrape time. Needed because clients are
 * synced from Drive independently of the news scraper — a news item scraped
 * before a client existed (or before that client's documents finished
 * ingesting) never gets a second look otherwise, since `/api/agent/run`
 * only matches the items it just inserted. Idempotent: matchNewsItem skips
 * pairs it's already matched.
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const errors: string[] = [];

  const { data: newsItems } = await admin
    .from("news_items")
    .select("*")
    .not("embedding", "is", null)
    .order("scraped_at", { ascending: false })
    .limit(200);

  let itemsChecked = 0;
  let itemsMatched = 0;

  for (const item of (newsItems ?? []) as NewsItem[]) {
    itemsChecked++;
    try {
      const matched = await matchNewsItem(admin, item);
      if (matched > 0) itemsMatched++;
    } catch (err) {
      errors.push(`Matching failed for "${item.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let draftsCreated = 0;
  try {
    draftsCreated = await generateDraftsForPendingMatches(admin);
  } catch (err) {
    errors.push(`Draft generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ itemsChecked, itemsMatched, draftsCreated, errors });
}
