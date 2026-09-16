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

interface NewsDataResult {
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  pubDate: string | null;
}

/**
 * NewsData.io is query-based rather than feed-based, so for `newsdata`
 * sources the `url` column holds a search query string (e.g. "transfer
 * pricing Malaysia") instead of an actual URL — set this when adding the
 * source row.
 */
async function fetchNewsData(source: Source): Promise<RawItem[]> {
  const params = new URLSearchParams({
    apikey: process.env.NEWSDATA_API_KEY ?? "",
    q: source.url,
    language: "en",
  });

  const res = await fetch(`https://newsdata.io/api/1/latest?${params}`);

  if (!res.ok) {
    throw new Error(`NewsData.io request failed for query "${source.url}": ${res.status}`);
  }

  const data = (await res.json()) as { results?: NewsDataResult[] };

  return (data.results ?? [])
    .filter((item) => item.link)
    .map((item) => ({
      sourceUrl: item.link,
      title: item.title ?? "(untitled)",
      rawContent: item.content ?? item.description ?? item.title ?? "",
      publishedDate: item.pubDate,
    }));
}

export async function fetchSource(source: Source): Promise<RawItem[]> {
  switch (source.type) {
    case "rss":
    case "google_alert":
      return fetchRss(source);
    case "firecrawl":
      return fetchFirecrawl(source);
    case "newsdata":
      return fetchNewsData(source);
  }
}
