-- Run this once in the Supabase SQL editor against the already-deployed
-- database (schema.sql now reflects this too, for anyone setting up fresh).
--
-- Adds an optional reason a manager can give when rejecting a draft. The TP
-- specialist agent (lib/agents/matcher.ts) now reads a client's recent
-- approve/reject history — reasons included — before judging a new match,
-- so the system calibrates to that manager's actual preferences instead of
-- repeating the same kind of call every time.

alter table drafts add column if not exists rejection_reason text;
