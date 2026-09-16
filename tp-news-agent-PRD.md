# PRD — Transfer Pricing News Intelligence Agent

**Prepared for:** Agentathon demo build
**Build environment:** Claude Code Web (claude.ai/code), GitHub, Vercel, Supabase — cloud-only, no local execution
**Author context:** Built for a Transfer Pricing partner at a Big 4 firm in Malaysia, covering Southeast Asian clients

\---

## 1\. Problem statement

TP teams manually track regulatory and industry news (OECD, tax authorities, Big 4 insights) and manually judge which updates matter to which clients based on that client's fact pattern (intercompany services, IP licensing, loans, manufacturing structure, etc.). This is slow, inconsistent, and doesn't scale across a client book.

## 2\. Goal

An agentic pipeline that:

1. Scrapes relevant TP/tax news weekly (or on manual trigger)
2. Matches each news item to the *specific* clients it's relevant to, using their actual fact pattern (not just keyword tags)
3. Drafts a personalized, source-linked email per client
4. Routes every draft to the assigned manager for approval before anything reaches a client
5. Tracks agent run history and match statistics on a dashboard

## 3\. Non-goals (for the demo)

* No auto-send to clients without manager approval — this is a hard requirement, not a toggle
* No reproduction of full scraped article text in any output — summaries only, always with a source link
* Not trying to cover every possible tax news source on day one — start with a config-driven source list that's easy to extend

## 4\. Model allocation strategy (cost efficiency is a design requirement)

Route by task complexity, not by defaulting everything to the biggest model:

|Task|Model|Why|Approx. volume/week|
|-|-|-|-|
|Clean raw scraped/RSS content into structured JSON (title, 2-sentence summary, topic tags, jurisdiction)|**Claude Haiku**|High volume, low-reasoning extraction/classification task|50–150 items|
|Vector similarity search (news → client fact matching)|**No LLM call** — pgvector cosine similarity query in Supabase|This is a database operation, not inference. Zero token cost.|Every item × every client|
|Judgment call on borderline/ambiguous matches (does this news genuinely apply given jurisdiction + fact nuance?) and writing the "why this matters to you" reasoning|**Claude Sonnet**|Needs actual TP judgment and nuanced language — only runs on items that already passed the vector similarity threshold|5–20 items|
|Drafting the final client-facing email (tone, structure, professional framing)|**Claude Sonnet**|Client-facing text quality matters; low volume (once per client per week)|1 per active client/week|
|Orchestrator control flow (routing, dedup, scheduling, DB writes)|**No LLM — plain TypeScript**|Pure business logic; don't spend tokens on deterministic steps|N/A|

This keeps the expensive model reserved for the \~10% of the pipeline that actually needs judgment, while the noisy, high-volume ingestion work runs on the cheap model.

## 5\. Architecture

```
News sources (RSS / Google Alerts / Firecrawl)
        │
        ▼
Scraper agents (Haiku: clean + tag each item)   ← scheduled weekly (Vercel Cron) or manual trigger
        │
        ▼
Orchestrator (plain code: dedupe, embed, store)
        │
        ▼
pgvector similarity search (news.embedding <=> client.fact\_embedding)
        │
        ▼
TP specialist agent (Sonnet: judge borderline matches + write client-specific reasoning)
        │
        ▼
Draft generator (Sonnet: compose per-client weekly email with source links)
        │
        ▼
Manager review (dashboard + email: Approve / Edit / Reject)
        │
        ▼
Client inbox (send only after explicit approval)
```

## 6\. Tech stack

|Layer|Choice|Notes|
|-|-|-|
|App framework|Next.js (App Router), deployed on Vercel Hobby|API routes double as agent endpoints|
|Database|Supabase (Postgres + pgvector extension), free tier|Also handles auth for manager login|
|Scheduling|Vercel Cron|Hobby allows up to 100 cron entries, once-per-day frequency each — fine, since weekly = `0 3 \* \* 1`|
|Scraping|`rss-parser` (npm) for RSS/Atom; Firecrawl free tier (1,000 credits/month) for JS-heavy or feed-less sites|Google Alerts set to "deliver as RSS" covers most government-authority gaps|
|Embeddings|Voyage AI (`voyage-4-lite` or `voyage-4`)|200M free tokens lifetime — effectively free at this scale|
|LLM|Anthropic API — Haiku + Sonnet as specified above|No restriction on API use in the deployed app|
|Email|Resend (free: 3,000/month, 100/day)|Sends manager review notifications and, post-approval, client emails|
|Manager auth/approval|Supabase Auth magic link, or signed token in email action links|Approve/Reject links must be single-use and expire|

## 7\. Data model (Supabase / Postgres)

```sql
create extension if not exists vector;

create table clients (
  id uuid primary key default gen\_random\_uuid(),
  name text not null,
  jurisdiction text not null,          -- e.g. 'Malaysia', 'Singapore', 'Vietnam'
  industry text,
  fact\_narrative text not null,        -- free-text description of TP fact pattern, human-written
  fact\_embedding vector(1024),
  manager\_id uuid references managers(id),
  created\_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen\_random\_uuid(),
  client\_id uuid references clients(id),
  name text,
  email text not null,
  role text
);

create table managers (
  id uuid primary key default gen\_random\_uuid(),
  name text not null,
  email text not null
);

create table sources (
  id uuid primary key default gen\_random\_uuid(),
  name text not null,                  -- e.g. 'OECD Tax News', 'LHDN Malaysia'
  url text not null,
  type text not null check (type in ('rss','firecrawl','google\_alert')),
  active boolean default true
);

create table news\_items (
  id uuid primary key default gen\_random\_uuid(),
  source\_id uuid references sources(id),
  source\_url text not null,
  title text not null,
  summary text not null,               -- our own words, never verbatim article text
  topic\_tags jsonb,                    -- e.g. \["intra-group services","management fees"]
  jurisdiction\_relevance jsonb,        -- e.g. \["Malaysia","OECD-wide"]
  published\_date date,
  embedding vector(1024),
  scraped\_at timestamptz default now(),
  unique (source\_url)
);

create table matches (
  id uuid primary key default gen\_random\_uuid(),
  news\_item\_id uuid references news\_items(id),
  client\_id uuid references clients(id),
  relevance\_score float,               -- cosine similarity, 0-1
  reasoning text,                      -- Sonnet-written "why this matters to you"
  created\_at timestamptz default now()
);

create table drafts (
  id uuid primary key default gen\_random\_uuid(),
  client\_id uuid references clients(id),
  manager\_id uuid references managers(id),
  match\_ids uuid\[],                    -- matches bundled into this week's email
  email\_subject text,
  email\_body text,
  status text default 'pending' check (status in ('pending','approved','rejected','sent')),
  created\_at timestamptz default now(),
  decided\_at timestamptz
);

create table agent\_runs (
  id uuid primary key default gen\_random\_uuid(),
  trigger\_type text check (trigger\_type in ('scheduled','manual')),
  started\_at timestamptz default now(),
  finished\_at timestamptz,
  sources\_checked int,
  items\_found int,
  items\_matched int,
  errors jsonb
);

-- indexes for vector search
create index on clients using ivfflat (fact\_embedding vector\_cosine\_ops);
create index on news\_items using ivfflat (embedding vector\_cosine\_ops);
```

## 8\. Agent specifications

### 8.1 Scraper agent (Haiku)

* Input: raw RSS entry or Firecrawl markdown output
* Output (strict JSON): `{ title, summary (2-3 sentences, own words), topic\_tags\[], jurisdiction\_relevance\[], published\_date }`
* Prompt must explicitly instruct: never copy sentences verbatim from the source; summarize in your own words; if the content is not TP/tax-relevant, return `{ "relevant": false }` so it's dropped before it ever reaches the database

### 8.2 Orchestrator (code, no LLM)

* Triggered by Vercel Cron (weekly) or a manual "Run now" button on the dashboard
* Fetches all `active` sources, calls the appropriate fetcher (RSS parser or Firecrawl), dedupes by `source\_url`, calls the Haiku scraper agent on new items, embeds accepted items via Voyage AI, writes to `news\_items`, logs the run to `agent\_runs`

### 8.3 TP specialist agent (Sonnet)

* For each new `news\_item`, runs a pgvector query: `select \* from clients order by fact\_embedding <=> $news\_embedding limit 10`
* Applies a jurisdiction pre-filter (drop clients where jurisdiction clearly doesn't apply, unless the news is OECD/global)
* For remaining candidates above a similarity threshold (start at 0.75, tune from demo data), calls Sonnet with: the news summary, the client's fact narrative, and asks it to (a) confirm genuine relevance in 1 sentence of reasoning, or (b) reject if the vector match is a false positive
* Writes accepted matches to `matches` with `reasoning` and `relevance\_score`

### 8.4 Draft generator (Sonnet)

* Runs weekly per client with any pending unbundled matches: composes one email combining all matches for that client, each item as a short paragraph with its source link, in a professional Big 4 tone
* Writes to `drafts` with `status = 'pending'`, notifies the assigned manager via Resend

### 8.5 Manager review (dashboard + email action links)

* Manager can Approve (moves to `sent`, triggers client email), Edit (opens draft in dashboard for inline edits before approving), or Reject (moves to `rejected`, logged for tuning)
* No client email is ever sent without an explicit `approved` status change

## 9\. Source list (starter config, extend via `sources` table)

|Source|Type|Notes|
|-|-|-|
|OECD Tax News|rss|Check `/tax` section for feed URL|
|Tax Foundation|rss||
|ITR (International Tax Review)|rss|Verify feed availability|
|KPMG / PwC / EY / Deloitte tax insights|rss (if available) / firecrawl|Big 4 insight pages often have feeds under newsroom|
|LHDN (Malaysia)|google\_alert or firecrawl|No public RSS typically|
|IRAS (Singapore)|google\_alert or firecrawl||
|ATO (Australia)|google\_alert or firecrawl||
|HMRC (UK)|google\_alert or firecrawl|Lower priority for SEA relevance, keep for OECD-adjacent global guidance|
|Google Alert: "transfer pricing Malaysia"|google\_alert|Deliver as RSS via Google Alerts settings|
|Google Alert: "APA Southeast Asia"|google\_alert||
|Google Alert: "BEPS Pillar Two ASEAN"|google\_alert||

## 10\. Dashboard (frontend) requirements

* Login (manager auth via Supabase)
* Run history table (`agent\_runs`): trigger type, items found/matched, timestamp, manual "Run now" button
* Pending drafts queue per manager: client name, matched items count, preview, Approve/Edit/Reject
* Simple stats view: matches per week, approval rate, top-matched topics, source hit rate (useful as your "opportunities tracked" statistics for the competition)
* Client list management: add/edit client fact narrative (this is what drives embedding quality — worth a clean UI)

## 11\. Compliance notes

* Never store or output full verbatim article text — summaries only, always paired with the source link so the manager can verify
* Client fact data and contact emails are sensitive — Supabase row-level security should restrict each manager to only their assigned clients
* Malaysia PDPA — treat client fact narratives and contact details as personal/confidential data; no data leaves Supabase except embeddings sent to Voyage AI and text sent to Anthropic's API for processing (standard for both — no training on API data by default, worth confirming current terms before the live demo)

## 12\. Suggested build order (for Claude Code Web)

1. Scaffold Next.js app + Supabase project, run the schema in section 7
2. Build the scraper agent + RSS/Firecrawl fetchers + orchestrator as API routes, test manually against 2-3 sources
3. Add embedding generation (Voyage AI) for a handful of seed clients + news items, verify pgvector similarity queries return sensible results
4. Build the TP specialist agent (Sonnet reasoning layer) on top of the vector matches
5. Build the draft generator + Resend integration
6. Build the manager dashboard (run history, pending drafts, approve/reject)
7. Wire up Vercel Cron for the weekly schedule
8. Seed 3-5 realistic demo clients with varied fact patterns and run an end-to-end test with real scraped news

## 13\. Open items to confirm before/during build

* Exact RSS feed URLs for each source (verify at build time — feed availability changes)
* Similarity threshold tuning (start 0.75, adjust based on false positive/negative rate in testing)
* Whether managers log in via magic link or the firm's existing SSO (out of scope for demo — magic link is fine)

