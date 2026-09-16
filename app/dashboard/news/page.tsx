import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMalaysiaDate, malaysiaTodayStartUtc } from "@/lib/format";
import type { NewsItem } from "@/lib/types";

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
          <p className="text-sm text-zinc-500">
            Everything the Haiku scraper agent classified as relevant, before client matching. Not every item here
            will match a client — see the Drafts tab for matched, bundled results. Nothing is ever deleted — this
            view just defaults to today.
          </p>
        </div>
        <Link
          href={showAll ? "/dashboard/news" : "/dashboard/news?all=true"}
          className="whitespace-nowrap rounded-md border border-black/10 px-3 py-1.5 text-xs dark:border-white/10"
        >
          {showAll ? "Show today only" : "Show all history"}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {(newsItems as NewsItem[] | null)?.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="font-medium">{item.title}</p>
              <span className="whitespace-nowrap text-xs text-zinc-400">{formatMalaysiaDate(item.scraped_at)}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(item.topic_tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {tag}
                </span>
              ))}
              {(item.jurisdiction_relevance ?? []).map((j) => (
                <span
                  key={j}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  {j}
                </span>
              ))}
            </div>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-zinc-500 underline"
            >
              Source
            </a>
          </div>
        ))}
        {(!newsItems || newsItems.length === 0) && (
          <p className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm text-zinc-500 dark:border-white/10">
            {showAll
              ? 'No news scraped yet — click "Run now" on the Runs tab.'
              : 'Nothing scraped today yet — click "Run now" on the Runs tab, or check "Show all history" for earlier items.'}
          </p>
        )}
      </div>
    </div>
  );
}
