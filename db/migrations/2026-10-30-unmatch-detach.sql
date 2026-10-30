-- ============================================================================
-- UNMATCH DETACHES, IT DOES NOT DESTROY.  Authored 2026-10-30.  NOT YET APPLIED.
-- ============================================================================
-- Problem (measured, not assumed):
--   * src/app/api/chat/unmatch/route.ts ran `delete(matches)`;
--   * messages.match_id and chat_media.match_id are both `references matches(id)
--     on delete cascade` (2026-10-16-rls-and-media-ownership.sql:130 and the
--     shipped drizzle schema);
--   * no path in the app deletes the conversation's objects from the `chat-media`
--     bucket.
--   => One member's tap destroyed a shared history for the other member too,
--      permanently, and left their photos as unservable, unfindable bytes.
--
-- Behaviour this migration makes possible (rationale and citations:
-- docs/research/2026-10-30/UNMATCH-EVIDENCE.md):
--   Tinder's client keeps `matches`, `messages` and an optimistic `unmatchedIds`
--   slice as separate state; Bumble documents that the *recipient* of an unmatch
--   keeps the conversation visible "so you can still report them"; Hinge splits
--   Hide (visibility) from Unmatch (severance). So: keep the row, record who
--   severed it and why, and make visibility a per-member decision.
--
-- The `on delete cascade` foreign keys are deliberately LEFT ALONE. Account
-- deletion must still purge a member's messages and media rows, and that is what
-- they are for. Unmatch simply stops pulling that lever.
--
-- Apply with:  psql "$DATABASE_URL" -f db/migrations/2026-10-30-unmatch-detach.sql
-- Reversible:  yes, every statement is additive; the DROP lines at the bottom.

begin;

-- 1. Provenance columns. `unmatched_by` is set null on account deletion on purpose:
--    the ended conversation belongs to BOTH members, so deleting one account must not
--    erase the record of why the thread closed for the other.
alter table if exists public.matches
  add column if not exists unmatched_by uuid references public.user_profiles (id) on delete set null;
alter table if exists public.matches
  add column if not exists unmatched_at timestamptz;
alter table if exists public.matches
  add column if not exists unmatch_reason text;

-- 2. Widen the status vocabulary. Drop-then-add because Postgres has no
--    "alter constraint", and a table with existing rows cannot gain a stricter check.
alter table if exists public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check
  check (status in ('active','archived','blocked','unmatched'));

-- 3. The reason vocabulary is Freeborn's own; the *step* is what Bumble and Hinge both
--    present. Nullable: a member may end a chat without saying why.
alter table if exists public.matches drop constraint if exists matches_unmatch_reason_check;
alter table public.matches add constraint matches_unmatch_reason_check
  check (unmatch_reason is null or unmatch_reason in
    ('not_interested','met_someone','moved_off_app','inappropriate','safety','other'));

-- 4. An 'unmatched' row without an actor/timestamp is a bug, not a state.
alter table if exists public.matches drop constraint if exists matches_unmatched_has_actor;
alter table public.matches add constraint matches_unmatched_has_actor
  check (status <> 'unmatched' or (unmatched_by is not null and unmatched_at is not null));

-- 5. Every chat list, deck query and unread badge now filters on status. Without this
--    index that filter reads the whole matches table per member.
create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_unmatched_at_idx on public.matches (unmatched_at)
  where unmatched_at is not null;

commit;

-- Verify with:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.matches'::regclass order by conname;
--     -- matches_status_check must list 'unmatched'; the two new checks must appear.
--   select column_name, is_nullable from information_schema.columns
--     where table_name='matches' and column_name like 'unmatch%' order by 1;
--     -- three rows.
--   select indexname from pg_indexes where tablename='matches' and indexname like 'matches_%idx';
--     -- matches_status_idx and matches_unmatched_at_idx present.
--   select status, count(*) from public.matches group by 1;
--     -- unchanged from before the migration: this migration rewrites no rows.
--   select count(*) from public.messages;      -- must not move.
--   select count(*) from public.chat_media;    -- must not move.

-- Roll back with:
--   alter table public.matches drop constraint if exists matches_unmatched_has_actor;
--   alter table public.matches drop constraint if exists matches_unmatch_reason_check;
--   alter table public.matches drop constraint if exists matches_status_check;
--   alter table public.matches add constraint matches_status_check
--     check (status in ('active','archived','blocked'));   -- after clearing any 'unmatched' rows
--   drop index if exists public.matches_status_idx;
--   drop index if exists public.matches_unmatched_at_idx;
--   alter table public.matches drop column if exists unmatch_reason;
--   alter table public.matches drop column if exists unmatched_at;
--   alter table public.matches drop column if exists unmatched_by;
