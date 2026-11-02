-- FB-13: private, participant-scoped call signaling.
-- Additive migration: existing public chat channels are untouched. Call topics
-- become usable only after the matching client ships; no public access is widened.

begin;

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  caller_id uuid not null references public.user_profiles(id) on delete cascade,
  callee_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null check (kind in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','active','ended')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint call_sessions_distinct_members check (caller_id <> callee_id),
  constraint call_sessions_ended_has_time check (status <> 'ended' or ended_at is not null)
);

create index if not exists call_sessions_match_idx on public.call_sessions(match_id, created_at desc);
create index if not exists call_sessions_caller_idx on public.call_sessions(caller_id, created_at desc);
create index if not exists call_sessions_callee_idx on public.call_sessions(callee_id, status, expires_at);

alter table public.call_sessions enable row level security;
alter table public.call_sessions force row level security;
revoke all on public.call_sessions from public, anon, authenticated;
grant all on public.call_sessions to service_role;

-- The helper returns only a boolean. SECURITY DEFINER is required because the
-- live matches table is RLS-forced with no client policies; the predicate itself
-- still checks auth.uid(), session membership, match state, expiry and blocks.
create or replace function public.can_use_call_topic(p_topic text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.can_use_call_topic(text, boolean) from public, anon;
grant execute on function public.can_use_call_topic(text, boolean) to authenticated, service_role;

drop policy if exists "Freeborn call topics are receive-scoped" on realtime.messages;
create policy "Freeborn call topics are receive-scoped"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and public.can_use_call_topic((select realtime.topic()), false)
);

drop policy if exists "Freeborn call topics are send-scoped" on realtime.messages;
create policy "Freeborn call topics are send-scoped"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and public.can_use_call_topic((select realtime.topic()), true)
);

commit;
