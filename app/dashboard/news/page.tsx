import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate, malaysiaTodayStartUtc } from "@/lib/format";
import type { NewsItem } from "@/lib/types";
import RematchButton from "./rematch-button";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const { all } = await searchParams;
  const showAll = all === "true";

  const supabase = await createClient();

  let query = supabase.from("news_items").select("*").order("scraped_at", { ascending: false }).limit(100);
  if (!showAll) {
    query = query.gte("scraped_at", malaysiaTodayStartUtc());
  }
  const { data: newsItems } = await query;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Scraped news</h1>
          <p className="text-sm text-muted">
            Everything the Haiku scraper agent classified as relevant, before client matching. Not every item here
            will match a client — see the Drafts tab for matched, bundled results. Nothing is ever deleted — this
            view just defaults to today.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href={showAll ? "/dashboard/news" : "/dashboard/news?all=true"}
            className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent/50"
          >
            {showAll ? "Show today only" : "Show all history"}
          </Link>
          <RematchButton />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {(newsItems as NewsItem[] | null)?.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <p className="font-medium">{item.title}</p>
              <span className="whitespace-nowrap text-xs text-muted">{formatMalaysiaDate(item.scraped_at)}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-300">{item.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(item.topic_tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
              {(item.jurisdiction_relevance ?? []).map((j) => (
                <span key={j} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                  {j}
                </span>
              ))}
            </div>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-muted underline"
            >
              Source
            </a>
          </div>
        ))}
        {(!newsItems || newsItems.length === 0) && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            {showAll
              ? 'No news scraped yet — click "Run now" on the Runs tab.'
              : 'Nothing scraped today yet — click "Run now" on the Runs tab, or check "Show all history" for earlier items.'}
          </p>
        )}
      </div>
    </div>
  );
}
