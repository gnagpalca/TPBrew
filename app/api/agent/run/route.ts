import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { fetchSource } from "@/lib/agents/fetchers";
import { cleanAndClassify } from "@/lib/agents/scraper";
import { embedText } from "@/lib/voyage";
import { matchNewsItem } from "@/lib/agents/matcher";
import { generateDraftsForPendingMatches } from "@/lib/agents/draft";
import type { Source, NewsItem } from "@/lib/types";

export const maxDuration = 300; // this pipeline calls several LLMs sequentially

async function isAuthorized(request: NextRequest): Promise<"scheduled" | "manual" | null> {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return "scheduled";
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? "manual" : null;
}

// Vercel Cron invokes scheduled functions with GET; the dashboard's
// "Run now" button uses POST. Both run the identical pipeline.
export async function GET(request: NextRequest) {
  return runPipeline(request);
}

export async function POST(request: NextRequest) {
  return runPipeline(request);
}

async function runPipeline(request: NextRequest) {
  const triggerType = await isAuthorized(request);
  if (!triggerType) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];

  const { data: run } = await admin
    .from("agent_runs")
    .insert({ trigger_type: triggerType })
    .select()
    .single();

  const { data: sources } = await admin.from("sources").select("*").eq("active", true);
  const activeSources = (sources ?? []) as Source[];

  let itemsFound = 0;
  const newItems: NewsItem[] = [];

  for (const source of activeSources) {
    try {
      const rawItems = await fetchSource(source);

      for (const rawItem of rawItems) {
        const { data: existing } = await admin
          .from("news_items")
          .select("id")
          .eq("source_url", rawItem.sourceUrl)
          .maybeSingle();
        if (existing) continue; // already scraped — dedupe by source_url

        const scraped = await cleanAndClassify(rawItem);
        if (!scraped.relevant) continue;

        const embedding = await embedText(`${scraped.title}\n${scraped.summary}`);

        const { data: inserted, error: insertError } = await admin
          .from("news_items")
          .insert({
            source_id: source.id,
            source_url: rawItem.sourceUrl,
            title: scraped.title,
            summary: scraped.summary,
            topic_tags: scraped.topic_tags,
            jurisdiction_relevance: scraped.jurisdiction_relevance,
            published_date: scraped.published_date,
            embedding,
          })
          .select()
          .single();

        if (insertError) {
          errors.push(`Insert failed for ${rawItem.sourceUrl}: ${insertError.message}`);
          continue;
        }

        itemsFound++;
        newItems.push(inserted as NewsItem);
      }
    } catch (err) {
      errors.push(`Source "${source.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let itemsMatched = 0;
  for (const item of newItems) {
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

  await admin
    .from("agent_runs")
    .update({
      finished_at: new Date().toISOString(),
      sources_checked: activeSources.length,
      items_found: itemsFound,
      items_matched: itemsMatched,
      errors: errors.length > 0 ? errors : null,
    })
    .eq("id", run?.id);

  return NextResponse.json({
    runId: run?.id,
    sourcesChecked: activeSources.length,
    itemsFound,
    itemsMatched,
    draftsCreated,
    errors,
  });
}
