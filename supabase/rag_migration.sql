-- RAG feature migration — run this in Supabase SQL Editor AFTER schema.sql
-- has already been applied. Adds document storage for (a) per-client TP
-- documents and (b) Malaysia regulatory framework references, so the TP
-- specialist agent can ground its matching/reasoning in real source
-- material instead of just the short fact_narrative text.

create table if not exists document_sources (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('client_tp_doc', 'regulatory_framework')),
  client_id uuid references clients (id) on delete cascade, -- null for regulatory_framework
  title text not null,
  jurisdiction text,          -- e.g. 'Malaysia', 'OECD-wide' — mainly for regulatory_framework
  source_ref text,            -- e.g. Google Drive file id/url, for traceability
  created_at timestamptz default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_source_id uuid references document_sources (id) on delete cascade,
  category text not null check (category in ('client_tp_doc', 'regulatory_framework')),
  client_id uuid references clients (id) on delete cascade, -- denormalized for RLS + filtering
  jurisdiction text,                                        -- denormalized for filtering
  chunk_index int not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists document_chunks_embedding_idx on document_chunks using ivfflat (embedding vector_cosine_ops);

-- Track which document chunks grounded a given match, so the orchestrator
-- run and manager dashboard can audit what the TP specialist agent actually
-- relied on rather than treating it as a black box.
alter table matches add column if not exists citations jsonb;

-- ---------------------------------------------------------------------------
-- match_document_chunks: pgvector similarity search scoped to a category and
-- optionally a specific client and/or jurisdiction. Used twice per news item
-- by the TP specialist agent: once for that client's own TP docs, once for
-- Malaysia regulatory framework docs relevant to the news's jurisdiction.
-- ---------------------------------------------------------------------------

create or replace function match_document_chunks(
  query_embedding vector(1024),
  match_category text,
  match_client_id uuid default null,
  match_jurisdiction text default null,
  match_count int default 5
)
returns table (
  id uuid,
  document_source_id uuid,
  title text,
  content text,
  similarity float
)
language sql stable security definer
as $$
  select
    dc.id,
    dc.document_source_id,
    ds.title,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join document_sources ds on ds.id = dc.document_source_id
  where dc.embedding is not null
    and dc.category = match_category
    and (match_client_id is null or dc.client_id = match_client_id)
    and (match_jurisdiction is null or dc.jurisdiction = match_jurisdiction or dc.jurisdiction = 'OECD-wide')
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — governs what a manager sees via the dashboard.
-- Ingestion always happens server-side via the service-role client, which
-- bypasses RLS, so no insert/update policies are needed here.
-- ---------------------------------------------------------------------------

alter table document_sources enable row level security;
alter table document_chunks enable row level security;

create policy "document_sources_select" on document_sources
  for select using (
    category = 'regulatory_framework'
    or exists (select 1 from clients c where c.id = document_sources.client_id and c.manager_id = auth.uid())
  );

create policy "document_chunks_select" on document_chunks
  for select using (
    category = 'regulatory_framework'
    or exists (select 1 from clients c where c.id = document_chunks.client_id and c.manager_id = auth.uid())
  );
