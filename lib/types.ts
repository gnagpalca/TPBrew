export type SourceType = "rss" | "firecrawl" | "google_alert";

export interface Source {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  jurisdiction: string;
  industry: string | null;
  fact_narrative: string;
  fact_embedding: number[] | null;
  manager_id: string | null;
  created_at: string;
}

export interface NewsItem {
  id: string;
  source_id: string | null;
  source_url: string;
  title: string;
  summary: string;
  topic_tags: string[] | null;
  jurisdiction_relevance: string[] | null;
  published_date: string | null;
  embedding: number[] | null;
  scraped_at: string;
}

export interface Match {
  id: string;
  news_item_id: string;
  client_id: string;
  relevance_score: number;
  reasoning: string;
  created_at: string;
}

export type DraftStatus = "pending" | "approved" | "rejected" | "sent";

export interface Draft {
  id: string;
  client_id: string;
  manager_id: string | null;
  match_ids: string[];
  email_subject: string;
  email_body: string;
  status: DraftStatus;
  created_at: string;
  decided_at: string | null;
}

export interface AgentRun {
  id: string;
  trigger_type: "scheduled" | "manual";
  started_at: string;
  finished_at: string | null;
  sources_checked: number | null;
  items_found: number | null;
  items_matched: number | null;
  errors: unknown;
}

// Strict JSON contract the Haiku scraper agent must return (PRD §8.1).
export type ScrapedItem =
  | {
      relevant: true;
      title: string;
      summary: string;
      topic_tags: string[];
      jurisdiction_relevance: string[];
      published_date: string | null;
    }
  | { relevant: false };
