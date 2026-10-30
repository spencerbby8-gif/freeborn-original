-- FIX: human_challenges_single_live locked members out after one abandoned attempt.
--
-- The index was UNIQUE (email, purpose, status). The issue endpoints
-- (/api/verification/challenge, /api/human/issue) enforce "one live challenge per
-- (member, purpose)" by expiring the previous 'issued' row and inserting a new one.
-- With `status` inside the key, every expiry moved a row into a bucket that ALREADY
-- held the previous abandoned attempt's row, so the second UPDATE raised
--   23505 duplicate key value violates unique constraint "human_challenges_single_live"
-- and the member could not obtain another liveness token, appeal token or reset token
-- for that (email, purpose) again. Neither statement is wrapped in a try/catch, so the
-- route answered 500, not "retry".
--
-- The rule the code wants is "any number of historical rows, at most one 'issued'".
-- A partial unique index states exactly that.
--
-- Idempotent and re-runnable, because this file is applied by hand in production and
-- `drizzle-kit push` in review environments; both may land on a database that already
-- carries the fixed shape.

-- SHAPE MATTERS, AND IT DIFFERS BETWEEN ENVIRONMENTS. A review database built with
-- `drizzle-kit push` carries this as a standalone UNIQUE INDEX; the live Supabase
-- database carries it as a table CONSTRAINT (added by 20260713120000), and
-- `drop index` on a constraint-backed index fails with
--   2BP01 cannot drop index ... because constraint ... requires it.
-- Verified against production on 2026-10-30: the first version of this file, which only
-- said `drop index if exists`, was refused by the production database. Both forms are
-- therefore removed here, and the replacement is created as an index because a
-- constraint cannot be partial. Same name, so an ORM push swaps the shape and not the
-- identity of the constraint.
begin;

alter table if exists public.human_challenges
  drop constraint if exists human_challenges_single_live;

drop index if exists public.human_challenges_single_live;

create unique index if not exists human_challenges_single_live
  on public.human_challenges (email, purpose)
  where status = 'issued';

-- The constraint comment lives in the catalogue so a reader of `\d human_challenges`
-- on the production database learns why the predicate is load-bearing. `comment on
-- index` takes exactly one literal, hence the single string.
comment on index public.human_challenges_single_live is
  'At most ONE live (status=issued) challenge per (email, purpose). Partial on purpose: status must NOT be part of the key — a unique (email,purpose,status) index made the expire-previous UPDATE throw 23505 after the second abandoned attempt and stranded the member in every purpose that shares this table. See db/migrations/2026-10-29-human-challenge-single-live.sql.';

commit;

-- Rollback shape, for the record — restores the defective constraint. Do not run it:
--   drop index if exists public.human_challenges_single_live;
--   create unique index human_challenges_single_live on public.human_challenges (email, purpose, status);
