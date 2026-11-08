-- Participant-only, content-free chat broadcast acceleration.
-- Additive: no member table, message, Realtime ownership, publication or cron is changed.
-- The only table grant is member SELECT on the existing RLS-protected chat_signals table.
-- The durable chat_signals row and the HTTP conversation remain authoritative.

begin;

-- Realtime Authorization evaluates this predicate with the subscriber's JWT.
-- is_match_participant is the existing, narrowly scoped SECURITY DEFINER helper:
-- it returns only whether auth.uid() belongs to the match and cannot expose a row.
-- Read and write intentionally use the same membership boundary. Message sends,
-- unmatching and clearing are still authorized by their HTTP routes before any
-- server-originated nudge is scheduled; a broadcast can only request a refetch.
create or replace function public.can_use_chat_topic(p_topic text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when (select auth.uid()) is null then false
    when p_write is null then false
    when p_topic ~ '^fb-chat:[0-9a-fA-F-]{36}$' then
      public.is_match_participant(substring(p_topic from 9)::uuid)
    else false
  end;
$$;

comment on function public.can_use_chat_topic(text, boolean) is
  'May the current member receive/send a content-free nudge on this chat topic? Membership only; HTTP remains the message authority.';

revoke all on function public.can_use_chat_topic(text, boolean) from public, anon;
grant execute on function public.can_use_chat_topic(text, boolean) to authenticated, service_role;

-- Make the member listener's table privilege explicit on every clean/start environment.
-- The existing "Participants may read chat signals" policy remains the participant-only
-- row boundary (including severance notices); this grant does not widen that policy.
grant select on public.chat_signals to authenticated;

drop policy if exists "Freeborn chat topics are participant-readable" on realtime.messages;
create policy "Freeborn chat topics are participant-readable"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and public.can_use_chat_topic((select realtime.topic()), false)
);

drop policy if exists "Freeborn chat topics are participant-writable" on realtime.messages;
create policy "Freeborn chat topics are participant-writable"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and public.can_use_chat_topic((select realtime.topic()), true)
);

commit;

-- Required positive/negative verification (not a Production data mutation):
--   participant RPC can_use_chat_topic('fb-chat:<own-match>', false/true) = true/true
--   stranger calls for the same topic = false/false; anonymous execution is denied
--   participant private subscription = SUBSCRIBED
--   stranger and anonymous private subscriptions != SUBSCRIBED
--   payloads contain only { kind, at }; never text, sender id, email or media.
