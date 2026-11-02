-- FB-13 follow-up: participants may READ their own call-session metadata.
-- Writes remain service-only; Realtime publish authority is still governed by
-- realtime.messages policies + can_use_call_topic(). No existing chat changes.
begin;

grant select on public.call_sessions to authenticated;

drop policy if exists "Participants read own call sessions" on public.call_sessions;
create policy "Participants read own call sessions"
on public.call_sessions for select to authenticated
using ((select auth.uid()) in (caller_id, callee_id));

commit;
