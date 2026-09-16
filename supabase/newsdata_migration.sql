-- Adds 'newsdata' as an allowed sources.type value.
-- Run this in Supabase SQL Editor if schema.sql was already applied
-- before this source type existed.

alter table sources drop constraint if exists sources_type_check;
alter table sources add constraint sources_type_check
  check (type in ('rss', 'firecrawl', 'google_alert', 'newsdata'));
