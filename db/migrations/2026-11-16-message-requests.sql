-- 2026-11-16-message-requests.sql
--
-- Owner addendum 2026-11-15: "fix the user message button when you view other
-- user profiles so that it creates message requests."
--
-- Until now the Message button on another member's profile called
-- /api/chat/start, which requires a mutual like; without one it answered 409
-- and the button did NOTHING - no toast, no state, no explanation. A member
-- reaching out for the first time now creates a REQUEST the other member
-- accepts or declines. Accepting mints the same match row a mutual like mints,
-- so threads, fb-chat topics, the realtime policies captured in
-- 2026-11-15-call-realtime-policies.sql and the call engine all keep working
-- unchanged.
--
-- Trust model, enforced in RLS and re-checked in the API:
--   * either side can always READ the request (it concerns them);
--   * only the sender INSERTs, and never to themselves;
--   * the sender may move pending -> declined (cancel), or renew a declined
--     row back to pending, and nothing else - a sender reaching 'accepted'
--     would bypass the recipient, and no policy above permits it;
--   * the recipient may move pending -> accepted or declined;
--   * one request per ordered pair (unique index), so "Message" twice is one
--     request, not spam.
-- Blocks and the recipient's message-privacy rule are enforced in the API on
-- create and again on accept; a severed conversation stays severed (the API
-- refuses to mint a match over a severance).

create table public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.user_profiles (id) on delete cascade,
  to_id uuid not null references public.user_profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  constraint message_requests_status_check check (status in ('pending','accepted','declined'))
);

create unique index message_requests_pair_idx on public.message_requests (from_id, to_id);
create index message_requests_recipient_idx on public.message_requests (to_id, status);
create index message_requests_sender_idx on public.message_requests (from_id, status);

alter table public.message_requests enable row level security;
alter table public.message_requests force row level security;

revoke all on public.message_requests from anon;
grant select, insert, update on public.message_requests to authenticated;

/* The application connects as the least-privilege runtime login created by
   supabase/clean-start/compat/20261105000400_runtime_least_privilege.sql
   (freeborn_runtime). That role is NOT the table owner and is NOBYPASSRLS, so
   it needs an explicit DML grant AND a permissive policy of its own — every
   other table in this schema carries both, enumerated in that file. Without
   them the routes for this table fail closed with "permission denied for table
   message_requests": the first live preview walk of this feature returned HTTP
   500 on GET /api/chat/requests for exactly that reason, while the same query
   run as the owner succeeded. The server does its own member-scoped access
   control in the route handlers (bearer token -> member id), and the
   authenticated policies below stay the boundary for direct PostgREST access. */
grant select, insert, update, delete on public.message_requests to freeborn_runtime;

drop policy if exists "Members read their own message requests" on public.message_requests;
create policy "Members read their own message requests"
  on public.message_requests for select
  to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

drop policy if exists "Members send their own message requests" on public.message_requests;
create policy "Members send their own message requests"
  on public.message_requests for insert
  to authenticated
  with check (from_id = auth.uid() and to_id <> auth.uid());

drop policy if exists "Senders cancel or renew their own message requests" on public.message_requests;
create policy "Senders cancel or renew their own message requests"
  on public.message_requests for update
  to authenticated
  using (from_id = auth.uid() and status in ('pending','declined'))
  with check (from_id = auth.uid() and to_id = to_id and status in ('pending','declined'));

drop policy if exists "Recipients respond to their message requests" on public.message_requests;
create policy "Recipients respond to their message requests"
  on public.message_requests for update
  to authenticated
  using (to_id = auth.uid() and status = 'pending')
  with check (to_id = auth.uid() and from_id = from_id and status in ('accepted','declined'));

/* Runtime policy, idempotent and identical in shape to the one every other
   public table carries (see 20261105000400_runtime_least_privilege.sql). RLS
   is forced on this table, so the application's own login needs it to read and
   write the rows its handlers have already authorised. */
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'message_requests'
      and policyname = 'freeborn_runtime_all'
  ) then
    create policy freeborn_runtime_all on public.message_requests
      for all to freeborn_runtime using (true) with check (true);
  end if;
end $$;
