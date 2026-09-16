import Parser from "rss-parser";
import type { Source } from "@/lib/types";

export interface RawItem {
  sourceUrl: string;
  title: string;
  rawContent: string;
  publishedDate: string | null;
}

const rssParser = new Parser();

async function fetchRss(source: Source): Promise<RawItem[]> {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items ?? [])
    .filter((item) => item.link)
    .map((item) => ({
      sourceUrl: item.link!,
      title: item.title ?? "(untitled)",
      rawContent: item.contentSnippet ?? item.content ?? item.title ?? "",
      publishedDate: item.isoDate ?? item.pubDate ?? null,
    }));
}

async function fetchFirecrawl(source: Source): Promise<RawItem[]> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: source.url, formats: ["markdown"] }),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl request failed for ${source.url}: ${res.status}`);
  }

  const data = (await res.json()) as {
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  const markdown = data.data?.markdown;
  if (!markdown) return [];

  // Firecrawl scrapes a listing/landing page, not a discrete feed — treat
  // the whole page as a single raw item for the Haiku agent to triage.
  // Good enough for a demo source list; a real deployment would follow
  // article links found on the page instead.
  return [
    {
      sourceUrl: source.url,
      title: data.data?.metadata?.title ?? source.name,
      rawContent: markdown,
      publishedDate: null,
    },
  ];
}

export async function fetchSource(source: Source): Promise<RawItem[]> {
  switch (source.type) {
    case "rss":
    case "google_alert":
      return fetchRss(source);
    case "firecrawl":
      return fetchFirecrawl(source);
  }
}
