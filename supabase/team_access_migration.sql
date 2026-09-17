-- Run this once in the Supabase SQL editor against the already-deployed
-- database (schema.sql now reflects this too, for anyone setting up fresh).
--
-- Switches from "each manager only sees their own clients" to a shared-team
-- model: any signed-in manager can see and work with every client, match,
-- draft, and document, not just the ones they personally created. This is
-- what makes it safe to add a colleague as a second Supabase Auth user and
-- have them see the same Opportunities/Drafts/Clients data you do, instead
-- of an empty dashboard.
--
-- manager_id columns are untouched — they still record who created/is
-- nominally assigned to a row — they just no longer gate read/write access.

drop policy if exists "managers_select_self" on managers;
create policy "managers_select_all" on managers
  for select using (auth.role() = 'authenticated');

drop policy if exists "clients_select_own" on clients;
create policy "clients_select_all" on clients
  for select using (auth.role() = 'authenticated');
drop policy if exists "clients_insert_own" on clients;
create policy "clients_insert_all" on clients
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "clients_update_own" on clients;
create policy "clients_update_all" on clients
  for update using (auth.role() = 'authenticated');

drop policy if exists "contacts_select_own" on contacts;
create policy "contacts_select_all" on contacts
  for select using (auth.role() = 'authenticated');
drop policy if exists "contacts_write_own" on contacts;
create policy "contacts_write_all" on contacts
  for all using (auth.role() = 'authenticated');

drop policy if exists "matches_select_own" on matches;
create policy "matches_select_all" on matches
  for select using (auth.role() = 'authenticated');

drop policy if exists "drafts_select_own" on drafts;
create policy "drafts_select_all" on drafts
  for select using (auth.role() = 'authenticated');
drop policy if exists "drafts_update_own" on drafts;
create policy "drafts_update_all" on drafts
  for update using (auth.role() = 'authenticated');

drop policy if exists "document_sources_select" on document_sources;
create policy "document_sources_select_all" on document_sources
  for select using (auth.role() = 'authenticated');

drop policy if exists "document_chunks_select" on document_chunks;
create policy "document_chunks_select_all" on document_chunks
  for select using (auth.role() = 'authenticated');
