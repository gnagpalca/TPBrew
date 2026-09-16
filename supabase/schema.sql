-- Transfer Pricing News Intelligence Agent — schema
-- Run this once in Supabase Dashboard → SQL Editor (or `supabase db push`).

create extension if not exists vector;

-- managers.id is the Supabase Auth user id directly, so RLS can key off
-- auth.uid() with no extra join.
create table if not exists managers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  jurisdiction text not null,          -- e.g. 'Malaysia', 'Singapore', 'Vietnam'
  industry text,
  fact_narrative text not null,        -- free-text description of TP fact pattern, human-written
  fact_embedding vector(1024),
  manager_id uuid references managers (id),
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,
  name text,
  email text not null,
  role text
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- e.g. 'OECD Tax News', 'LHDN Malaysia'
  url text not null,
  type text not null check (type in ('rss', 'firecrawl', 'google_alert')),
  active boolean default true
);

create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources (id),
  source_url text not null,
  title text not null,
  summary text not null,               -- our own words, never verbatim article text
  topic_tags jsonb,                    -- e.g. ["intra-group services","management fees"]
  jurisdiction_relevance jsonb,        -- e.g. ["Malaysia","OECD-wide"]
  published_date date,
  embedding vector(1024),
  scraped_at timestamptz default now(),
  unique (source_url)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  news_item_id uuid references news_items (id) on delete cascade,
  client_id uuid references clients (id) on delete cascade,
  relevance_score float,               -- cosine similarity, 0-1
  reasoning text,                      -- Sonnet-written "why this matters to you"
  created_at timestamptz default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,
  manager_id uuid references managers (id),
  match_ids uuid[],                    -- matches bundled into this week's email
  email_subject text,
  email_body text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'sent')),
  created_at timestamptz default now(),
  decided_at timestamptz
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text check (trigger_type in ('scheduled', 'manual')),
  started_at timestamptz default now(),
  finished_at timestamptz,
  sources_checked int,
  items_found int,
  items_matched int,
  errors jsonb
);

-- indexes for vector search
create index if not exists clients_fact_embedding_idx on clients using ivfflat (fact_embedding vector_cosine_ops);
create index if not exists news_items_embedding_idx on news_items using ivfflat (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- match_clients: pgvector cosine-similarity search used by the TP specialist
-- agent (PRD §8.3) to find candidate clients for a given news item embedding.
-- security definer so it can be called via the service-role client and still
-- scan the full clients table regardless of caller RLS.
-- ---------------------------------------------------------------------------

create or replace function match_clients(
  query_embedding vector(1024),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  name text,
  jurisdiction text,
  industry text,
  fact_narrative text,
  fact_embedding vector(1024),
  manager_id uuid,
  created_at timestamptz,
  similarity float
)
language sql stable security definer
as $$
  select
    clients.id,
    clients.name,
    clients.jurisdiction,
    clients.industry,
    clients.fact_narrative,
    clients.fact_embedding,
    clients.manager_id,
    clients.created_at,
    1 - (clients.fact_embedding <=> query_embedding) as similarity
  from clients
  where clients.fact_embedding is not null
    and 1 - (clients.fact_embedding <=> query_embedding) > match_threshold
  order by clients.fact_embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Agent pipeline routes (scraper, orchestrator, matcher, draft generator) run
-- server-side with the Supabase service role key, which bypasses RLS
-- entirely. The policies below only govern what a signed-in manager can see
-- through the dashboard using the anon/browser client.
-- ---------------------------------------------------------------------------

alter table managers enable row level security;
alter table clients enable row level security;
alter table contacts enable row level security;
alter table sources enable row level security;
alter table news_items enable row level security;
alter table matches enable row level security;
alter table drafts enable row level security;
alter table agent_runs enable row level security;

-- Managers can see their own row only.
create policy "managers_select_self" on managers
  for select using (id = auth.uid());

-- Managers can see/edit only clients assigned to them.
create policy "clients_select_own" on clients
  for select using (manager_id = auth.uid());
create policy "clients_insert_own" on clients
  for insert with check (manager_id = auth.uid());
create policy "clients_update_own" on clients
  for update using (manager_id = auth.uid());

-- Contacts follow their parent client's ownership.
create policy "contacts_select_own" on contacts
  for select using (
    exists (select 1 from clients c where c.id = contacts.client_id and c.manager_id = auth.uid())
  );
create policy "contacts_write_own" on contacts
  for all using (
    exists (select 1 from clients c where c.id = contacts.client_id and c.manager_id = auth.uid())
  );

-- News items and sources are shared reference data — any signed-in manager
-- can read them (no client-confidential data lives here).
create policy "sources_select_all" on sources for select using (auth.role() = 'authenticated');
create policy "news_items_select_all" on news_items for select using (auth.role() = 'authenticated');

-- Matches are only visible via their client's ownership.
create policy "matches_select_own" on matches
  for select using (
    exists (select 1 from clients c where c.id = matches.client_id and c.manager_id = auth.uid())
  );

-- Drafts: a manager only sees/decides drafts assigned to them.
create policy "drafts_select_own" on drafts
  for select using (manager_id = auth.uid());
create policy "drafts_update_own" on drafts
  for update using (manager_id = auth.uid());

-- Run history is operational, not client-confidential — visible to any
-- signed-in manager for the dashboard's run-history table.
create policy "agent_runs_select_all" on agent_runs for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Auto-create a managers row the first time someone signs in via magic link,
-- so there's no separate manual "provision this manager" step during setup.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_manager()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.managers (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_manager();
