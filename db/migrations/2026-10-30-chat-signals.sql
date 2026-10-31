-- ============================================================================
-- FREEBORN · 2026-10-30 · chat signals for reliable realtime delivery
-- STATUS: APPLIED 2026-10-31 to production `ihwtpwlszegrjgakqsxx` as migration
--         `2026_10_30_chat_signals`, plus the corrective `2026_10_31_chat_signals_participant_predicate`
--         (the original SELECT policy read `matches` directly, which is RLS-locked, so it
--         could never be satisfied — see §4 of
--         docs/research/2026-10-31/PRODUCTION-MIGRATIONS-2026-10-31.md). The corrective change is
--         folded into this file so a fresh environment gets the working predicate in one step.
--         It must be run BEFORE the code that writes to it (same migration-before-deployment
--         order as 2026-10-30-unmatch-detach.sql).
-- ============================================================================
-- PURPOSE
--   Give the chat screen a notification path that this deployment can actually use.
--
-- WHY THIS SHAPE (all facts read from production `ihwtpwlszegrjgakqsxx` on 2026-10-30)
--   * public.messages / matches / chat_media / message_reactions:
--       relrowsecurity = true, relforcerowsecurity = true, ZERO policies.
--     Deny-by-default is correct for those tables — the app reaches them as its own role
--     through the transaction pooler, never as the member. But Supabase Realtime
--     `postgres_changes` applies RLS for the subscriber, so subscribing to `messages`
--     would deliver NOTHING to any client. The old design therefore had no option but the
--     2.5 s poll.
--   * The app has no service-role key in its environment (.env.example lists only
--     publishable/anon keys), so a route cannot POST /realtime/v1/api/broadcast either.
--   * Therefore: one tiny table, one narrow read policy, no write policy. The route writes
--     it as the app's own role; the client can only read it, and only for matches it is in.
--
-- WHAT IS IN IT: no message text, no member ids, no content. A signal says "conversation X
-- changed in way Y". Deleting or losing every row costs latency, never a message: the HTTP
-- fetch stays authoritative and the poll stays as the floor.
--
-- Additive + idempotent: no existing table is altered, no row is touched, nothing drops.
-- ----------------------------------------------------------------------------
-- 1) The table -----------------------------------------------------------------------------
create table if not exists public.chat_signals (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references public.matches (id) on delete cascade,
  kind        text not null default 'message'
              constraint "chat_signals_kind_check"
              check (kind in ('message', 'typing', 'severed', 'cleared')),
  created_at  timestamptz not null default now()
);

comment on table public.chat_signals is
  'Content-free change notifications for one conversation. Disposable: losing rows costs latency, never a message.';
comment on column public.chat_signals.kind is
  'message = fetch the thread; severed = the match ended (per-member view changed); cleared = the thread was emptied; typing = presence hint, never stored by the server.';

-- The client filter is always `match_id=eq.<uuid>` and the catch-up read is newest-first.
create index if not exists "chat_signals_match_created_idx"
  on public.chat_signals (match_id, created_at desc);

-- The CHECK above lives inside CREATE TABLE, so a database where `drizzle-kit push` already
-- created the table from src/db/schema.ts would skip it — and that is exactly the drift this
-- migration is meant to close, not inherit. Add it when it is genuinely absent (both sides
-- name it chat_signals_kind_check, so a table that already satisfies the contract is untouched).
do $sig_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_signals'::regclass and conname = 'chat_signals_kind_check'
  ) then
    alter table public.chat_signals
      add constraint "chat_signals_kind_check"
      check (kind in ('message', 'typing', 'severed', 'cleared'));
  end if;
end
$sig_check$;

-- ----------------------------------------------------------------------------
-- 2) RLS: participants may read their own conversation's signals. Nobody may write.
-- ----------------------------------------------------------------------------
alter table public.chat_signals enable row level security;
alter table public.chat_signals force row level security;

/* The predicate has to be a function, and the reason is measured, not theoretical.

   Written first as a bare `exists (select 1 from public.matches ...)` and run against
   production on 2026-10-31, it returned ZERO rows for a member who is in the match:

     DIAG uid=772a1827-... sees_matches=0 sees_signals=0 forced=true/true

   `public.matches` is itself RLS-enabled AND force-enabled with no policies, so when
   PostgREST/Realtime evaluates this policy as `authenticated`, the subquery inside the
   policy is itself filtered to nothing. A policy that reads a locked table can never be
   satisfied: every client would have been denied, silently, forever — and a deny-all
   policy passes a test that only checks strangers are refused. The participant-allowed
   direction is the one that has to be asserted (scripts/qa/pg-migration-verify.sh),
   which is why the flaw survived locally.

   SECURITY DEFINER, owned by `postgres`, is the narrow way out: `postgres` carries
   rolbypassrls = true, so the function sees `matches` while no caller ever gains
   readable access to it. It returns one boolean about the caller's own membership, is
   revoked from public, and is granted only to `authenticated` (and service_role, so a
   route can ask the same question). Nothing here widens what a client can read.

   The same flaw exists in two pre-existing policies on the legacy `match_messages`
   table; that table has no writer in this codebase (no route touches it; the trust
   harness pins it out of scope) so those policies are inert and are left alone here
   rather than churned in a media changeset. */
create or replace function public.is_match_participant(p_match uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
  );
$$;

do $own$
begin
  -- On Supabase the connecting role is `postgres`, which carries rolbypassrls = true (measured
  -- on ihwtpwlszegrjgakqsxx: postgres|super=false|bypass=true), so a function owned by it can
  -- read the RLS-locked `matches`. In a scratch cluster there may be no role named `postgres`
  -- at all, and the bootstrap superuser already owns the function and bypasses RLS anyway.
  -- pg_proc + regprocedure, not pg_class/regclass: a function is not a relation, and
  -- `'public.is_match_participant'::regclass` fails with "relation does not exist" (which is
  -- how this very guard failed its first run against a real cluster).
  if exists (select 1 from pg_roles where rolname = 'postgres')
     and (select r.rolname from pg_proc pr join pg_roles r on r.oid = pr.proowner
           where pr.oid = 'public.is_match_participant(uuid)'::regprocedure) <> 'postgres'
  then
    execute 'alter function public.is_match_participant(uuid) owner to postgres';
  end if;
end
$own$;
comment on function public.is_match_participant(uuid) is
  'Does the current member belong to this match? SECURITY DEFINER so the check can read matches, which is RLS-locked for clients. Returns a boolean about the caller only; no row data.';
revoke all on function public.is_match_participant(uuid) from public;
grant execute on function public.is_match_participant(uuid) to authenticated, service_role;

drop policy if exists "Participants may read chat signals" on public.chat_signals;
create policy "Participants may read chat signals"
  on public.chat_signals
  for select
  to authenticated
  using ( public.is_match_participant(match_id) );

-- Deliberately NO insert/update/delete policy: the client cannot write here even to spam a
-- peer. Only the app's own role (the transaction pooler, which bypasses RLS) produces signals.
-- NOTE the participation test ignores `matches.status`: a severed member must still be told the
-- conversation changed, because they keep read-only access to it for reporting. Status is a
-- *visibility* decision and lives in src/lib/match-lifecycle.ts, not in an infra policy.

-- ----------------------------------------------------------------------------
-- 3) Realtime publication -------------------------------------------------------------------
-- postgres_changes only ever emits for tables in the `supabase_realtime` publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_rel pr
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
         and n.nspname = 'public' and c.relname = 'chat_signals'
     )
  then
    execute 'alter publication supabase_realtime add table public.chat_signals';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 4) Bounded growth: signals are ephemeral, so cap the table, don't GC it.
-- ----------------------------------------------------------------------------
-- No retention job is needed and none is added (the same reasoning as the unmatch design: an
-- always-running sweeper is a new failure mode). Instead the write path deletes the previous
-- signals for a match whenever it inserts one, so at most a handful of rows exist per live
-- conversation and the cascade on matches(id) cleans the rest. The statement is in
-- src/app/api/chat/messages/route.ts, not here, so it is testable and never races a cron.

-- ============================================================================
-- Verify with:
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relname = 'chat_signals';                                   -- t, t
--   select policyname, cmd from pg_policies where tablename = 'chat_signals';
--                                                                      -- exactly 1 SELECT policy
--   -- and the direction that actually broke on first contact with production: the
--   -- participant must see rows. Run as the member, not as postgres:
--   --   begin; set local role authenticated;
--   --   set local request.jwt.claims = '{"sub":"<member in the match>"}';
--   --   select count(*) from public.chat_signals;   -- must be > 0  (was 0 before the fix)
--   --   reset role; rollback;
--   select count(*) from pg_publication_rel pr
--     join pg_class c on c.oid = pr.prrelid
--    where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
--      and c.relname = 'chat_signals';                                 -- 1
--   select conname from pg_constraint where conrelid = 'public.chat_signals'::regclass
--    and contype = 'c';                                                -- chat_signals_kind_check
--
-- Rollback with (safe at any time: no other table references this one):
--   begin;
--   alter table public.chat_signals disable row level security;
--   drop table if exists public.chat_signals;
--   commit;
-- ============================================================================
