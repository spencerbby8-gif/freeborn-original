-- 2026-11-15-call-realtime-policies.sql
--
-- Capture, verbatim from PRODUCTION, the Realtime authorization that calls and
-- chat depend on. Until now these objects existed ONLY in production, created
-- out-of-band with no migration in this directory. That means any fresh or
-- preview environment has ZERO policies on realtime.messages, and every private
-- Realtime join fails with CHANNEL_ERROR - the member sees "Couldn't open a
-- private call channel. Call again." while nothing in the app code is wrong.
-- Measured during owner report B11: the preview project joined its ring topic
-- successfully only because someone had applied these by hand to production and
-- the preview happened to inherit a working socket; a clean environment does
-- not. Authorization must live in a migration, not in someone's memory.
--
-- Captured from production project ihwtpwlszegrjgakqsxx on 2026-11-15 via:
--   select polname, polcmd, pg_get_expr(polqual, polrelid),
--          pg_get_expr(polwithcheck, polrelid) from pg_policy
--    where polrelid = 'realtime.messages'::regclass;
--   select pg_get_functiondef(oid) from pg_proc
--    where proname in ('can_use_call_topic','can_use_chat_topic',
--                      'is_match_participant');
-- Everything below reproduces those rows exactly. The migration is idempotent:
-- create or replace for the functions, drop-then-create for the policies, so it
-- is safe to run on production again and safe on a fresh environment once.
--
-- Trust model these policies encode (and why the app relies on it):
--   * fb-ring:<uid>       the owner may SELECT (hear their own rings) but never
--                         INSERT; a caller may INSERT only for a callee they have
--                         a LIVE ringing session with, an active match with, and
--                         no block in either direction. Widening SELECT would let
--                         one caller observe other members' incoming rings.
--   * fb-call:<uuid>      both participants of a session that is ringing or
--                         active (and not expired) may read and write; again with
--                         an active match and no block either way.
--   * fb-chat:<uuid>      both participants of the match, via
--                         is_match_participant.
--   * anything else       false. No anonymous access to any topic.

create or replace function public.is_match_participant(p_match uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
  );
$function$;

create or replace function public.can_use_call_topic(p_topic text, p_write boolean)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when (select auth.uid()) is null then false
    when p_topic = 'fb-ring:' || (select auth.uid())::text then not p_write
    when p_topic like 'fb-ring:%' and p_write then exists (
      select 1
      from public.call_sessions cs
      join public.matches m on m.id = cs.match_id
      where cs.caller_id = (select auth.uid())
        and p_topic = 'fb-ring:' || cs.callee_id::text
        and cs.status = 'ringing'
        and cs.expires_at > now()
        and m.status = 'active'
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = cs.caller_id and b.blocked_id = cs.callee_id)
             or (b.blocker_id = cs.callee_id and b.blocked_id = cs.caller_id)
        )
    )
    when p_topic ~ '^fb-call:[0-9a-fA-F-]{36}$' then exists (
      select 1
      from public.call_sessions cs
      join public.matches m on m.id = cs.match_id
      where cs.id = substring(p_topic from 9)::uuid
        and (select auth.uid()) in (cs.caller_id, cs.callee_id)
        and cs.status in ('ringing','active')
        and cs.expires_at > now()
        and m.status = 'active'
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = cs.caller_id and b.blocked_id = cs.callee_id)
             or (b.blocker_id = cs.callee_id and b.blocked_id = cs.caller_id)
        )
    )
    else false
  end;
$function$;

create or replace function public.can_use_chat_topic(p_topic text, p_write boolean)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when (select auth.uid()) is null then false
    when p_write is null then false
    when p_topic ~ '^fb-chat:[0-9a-fA-F-]{36}$' then
      public.is_match_participant(substring(p_topic from 9)::uuid)
    else false
  end;
$function$;

-- realtime.messages carries the broadcast channel rows; RLS must be on for the
-- policies below to mean anything. Enabling it again is a no-op.
alter table realtime.messages enable row level security;

drop policy if exists "Freeborn call topics are receive-scoped" on realtime.messages;
create policy "Freeborn call topics are receive-scoped"
  on realtime.messages for select
  to authenticated
  using ((extension = 'broadcast'::text) and public.can_use_call_topic((select realtime.topic()), false));

drop policy if exists "Freeborn call topics are send-scoped" on realtime.messages;
create policy "Freeborn call topics are send-scoped"
  on realtime.messages for insert
  to authenticated
  with check ((extension = 'broadcast'::text) and public.can_use_call_topic((select realtime.topic()), true));

drop policy if exists "Freeborn chat topics are participant-readable" on realtime.messages;
create policy "Freeborn chat topics are participant-readable"
  on realtime.messages for select
  to authenticated
  using ((extension = 'broadcast'::text) and public.can_use_chat_topic((select realtime.topic()), false));

drop policy if exists "Freeborn chat topics are participant-writable" on realtime.messages;
create policy "Freeborn chat topics are participant-writable"
  on realtime.messages for insert
  to authenticated
  with check ((extension = 'broadcast'::text) and public.can_use_chat_topic((select realtime.topic()), true));

-- Broadcasts need no publication entry: publication supabase_realtime only
-- governs postgres_changes (see 2026-10-30-chat-signals.sql), which is why the
-- chat poll stays as its floor and the call poll added with B11 stays as ours.
