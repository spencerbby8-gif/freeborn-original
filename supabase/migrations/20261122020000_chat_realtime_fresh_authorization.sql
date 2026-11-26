-- LOCAL RELEASE CANDIDATE ONLY: requires owner approval and independent review.
-- Tightens the predicate used on NEW/REFRESHED private-chat authorizations.
-- Realtime caches permissions: this does not revoke a previously joined socket,
-- prevent arbitrary payloads while authorized, control public channels, or prove
-- immediate revocation. Do not deploy as a complete relationship-safety fix.
begin;
create or replace function public.can_use_chat_topic(p_topic text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when (select auth.uid()) is null or p_write is null then false
    when p_topic ~ '^fb-chat:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      exists (
        select 1 from public.matches m
        where m.id = substring(p_topic from 9)::uuid
          and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
          and m.status in ('active', 'archived')
          and not exists (
            select 1 from public.blocked_users b
            where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
               or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
          )
      )
    else false
  end;
$$;
comment on function public.can_use_chat_topic(text, boolean) is
  'At authorization time: member of active/archived match with neither direction blocked. Realtime permission caches require separate revocation.';
revoke all on function public.can_use_chat_topic(text, boolean) from public, anon;
grant execute on function public.can_use_chat_topic(text, boolean) to authenticated, service_role;
commit;
