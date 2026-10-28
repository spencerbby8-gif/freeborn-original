-- FREEBORN — AUDIT F1–F10 DATABASE LOCKDOWN (applied 2026-10-27 via Supabase API)
-- This file RECORDS the live changes; re-running is safe for the GRANT/REVOKE
-- and policy statements. The source of truth is the live database.
-- No secret values appear in this file.

-- F1: invoker-safe, service-role-only view
alter view public.profile_with_photos set (security_invoker = true);
revoke all on public.profile_with_photos from anon, authenticated, public;
grant select on public.profile_with_photos to service_role;

-- F3: stats views out of the PostgREST-exposed schema
alter extension pg_stat_statements set schema extensions;
revoke usage on schema extensions from anon;

-- F4: no anonymous object grants in public; policies authenticated-only
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname='public' and roles::text like '%public%' loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- F5: discovery RPC no longer anonymously (or member) executable
revoke all on function public.discover_candidates(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.discover_candidates(uuid,integer,integer) to service_role;

-- F8: chat media private, no storage.objects policy grants it
update storage.buckets set public = false where id = 'chat-media';
drop policy if exists "chat media public read" on storage.objects;
drop policy if exists "chat media read" on storage.objects;
drop policy if exists "chat media upload" on storage.objects;
drop policy if exists "chat media own upload" on storage.objects;

-- F10: give Realtime a non-PII publication table so it can connect
create table if not exists public.realtime_health (
  id integer primary key default 1,
  checked_at timestamptz not null default now()
);
alter table public.realtime_health enable row level security;
revoke all on public.realtime_health from anon, public;
insert into public.realtime_health (id) values (1) on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public'
                   and tablename='realtime_health') then
    execute 'alter publication supabase_realtime add table public.realtime_health';
  end if;
end $$;
