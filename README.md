# TP News Intelligence Agent

Agentic pipeline that scrapes transfer-pricing/tax news weekly, matches each
item to the specific clients it's relevant to (via embeddings + LLM
judgment), drafts a personalized client email, and routes every draft
through manager approval before anything is sent. See `tp-news-agent-PRD.md`
for the full spec this was built from.

**No client email is ever sent without an explicit manager approval** —
there is no auto-send path.

## Stack

Next.js (App Router) on Vercel · Supabase (Postgres + pgvector) · Anthropic
API (Haiku for ingestion, Sonnet for judgment/drafting) · Voyage AI
(embeddings) · Resend (email) · Vercel Cron (weekly schedule).

## Setup

All secrets are entered directly into Supabase/Vercel by you — this repo
only ever references `process.env.VAR_NAME`, and `.env*` is gitignored, so
no key ever needs to be typed into a chat or committed to git.

### 1. Create accounts

- Supabase: https://supabase.com/dashboard
- Vercel: https://vercel.com/signup
- Anthropic Console (API key): https://console.anthropic.com/settings/keys
- Voyage AI (embeddings key): https://dashboard.voyageai.com/
- Resend (email key): https://resend.com/signup
- Firecrawl, optional, for JS-heavy/feed-less sources: https://www.firecrawl.dev/

### 2. Database

In your Supabase project → **SQL Editor**, run, in order:

1. `supabase/schema.sql` — tables, pgvector indexes, RLS policies, the
   `match_clients` similarity-search function, and an auth trigger that
   auto-provisions a `managers` row on first sign-in.
2. `supabase/seed.sql` — starter source list (verify feed URLs still work;
   they change over time).

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the real values yourself —
this file is gitignored:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page — server-only, bypasses RLS, never expose to the browser |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `VOYAGE_API_KEY` | dashboard.voyageai.com |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | resend.com — verify a sending domain/address first |
| `FIRECRAWL_API_KEY` | firecrawl.dev (optional) |
| `CRON_SECRET` | any random string you generate — protects `/api/agent/run` from being triggered by anyone but Vercel Cron |

### 4. Run locally

```bash
npm install
npm run dev
```

Sign in at `/login` with a magic link (any email — it becomes a manager
automatically on first sign-in via the schema's auth trigger).

### 5. Deploy

Push to GitHub, import into Vercel, and set the same environment variables
under **Project Settings → Environment Variables** (this is the other place
keys get entered directly by you, never through chat). Vercel Cron picks up
`vercel.json`'s weekly schedule automatically once deployed.

## Using it

1. **Clients** tab — add 3-5 demo clients with distinct, specific fact
   narratives (this text is what gets embedded and drives match quality),
   then add at least one contact email per client.
2. Click **Run now** on the **Runs** tab to trigger the pipeline manually:
   fetch sources → Haiku cleans/classifies → embed → pgvector match →
   Sonnet judges borderline matches → Sonnet drafts client emails → manager
   notified.
3. **Drafts** tab — review, edit inline, then **Approve & send** (sends
   immediately to the client's contacts) or **Reject**.
4. **Runs** tab also shows run history and rollup stats (matches, approval
   rate, top topics).

## Notes

- Summaries only, never verbatim article text (see PRD §3, §11) — every
  scraped item is rewritten by the Haiku agent, and every client email links
  back to the source instead of quoting it.
- Row-level security restricts each manager to their own assigned clients;
  reference data (sources, news items, run history) is readable by any
  signed-in manager.
- Similarity threshold for candidate matching starts at 0.75
  (`lib/agents/matcher.ts`) — tune based on false positive/negative rate
  once you have real demo data.
