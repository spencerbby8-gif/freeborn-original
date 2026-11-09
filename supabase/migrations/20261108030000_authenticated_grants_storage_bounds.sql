-- Remove member table privileges that no member RLS policy can authorize.
-- No grant is added, no policy/RLS/member-data/cron definition is changed.
-- Storage limits match the already-tested clean Preview contract.

begin;

-- Server-owned tables have no authenticated policy. Runtime access uses the
-- separately granted freeborn_runtime role and is deliberately untouched.
revoke all on table public.accounts from authenticated;
revoke all on table public.appeals from authenticated;
revoke all on table public.chat_media from authenticated;
revoke all on table public.event_interests from authenticated;
revoke all on table public.matches from authenticated;
revoke all on table public.messages from authenticated;
revoke all on table public.message_reactions from authenticated;
revoke all on table public.mixer_venues from authenticated;
revoke all on table public.moderation_actions from authenticated;
revoke all on table public.realtime_health from authenticated;
revoke all on table public.reports from authenticated;
revoke all on table public.security_events from authenticated;
revoke all on table public.sessions from authenticated;
revoke all on table public.support_requests from authenticated;
revoke all on table public.suspensions from authenticated;
revoke all on table public.verification_requests from authenticated;
revoke all on table public.warnings from authenticated;

-- Preserve exactly the currently policy-backed member operations.
revoke insert, update, delete on table public.chat_signals from authenticated;
revoke update, delete on table public.match_messages from authenticated;
revoke delete on table public.user_private_settings from authenticated;
revoke delete on table public.user_profiles from authenticated;
revoke delete on table public.user_swipes from authenticated;

-- Production drift only: clean Preview already has these exact bounds.
update storage.buckets
set file_size_limit = 6291456,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'verification-selfies';

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm',
      'audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav'
    ]::text[]
where id = 'chat-media';

-- Fail closed if a future edit leaves a direct member table privilege with no
-- corresponding member/PUBLIC policy. This checks revokes only; it does not
-- require every policy operation to have a table grant.
do $$
declare
  r record;
  expected_selfie text[] := array['image/jpeg','image/png','image/webp']::text[];
  expected_chat text[] := array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm',
    'audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav'
  ]::text[];
begin
  for r in
    select tp.table_name, tp.privilege_type
    from information_schema.table_privileges tp
    where tp.table_schema = 'public'
      and tp.grantee = 'authenticated'
      and not exists (
        select 1
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = tp.table_name
          and (p.cmd = 'ALL' or p.cmd = tp.privilege_type)
          and (
            p.roles @> array['authenticated']::name[]
            or p.roles @> array['public']::name[]
          )
      )
  loop
    raise exception 'authenticated privilege % on % has no matching member RLS policy',
      r.privilege_type, r.table_name;
  end loop;

  if not exists (
    select 1 from storage.buckets
    where id = 'verification-selfies'
      and public = false
      and file_size_limit = 6291456
      and allowed_mime_types @> expected_selfie
      and expected_selfie @> allowed_mime_types
  ) then
    raise exception 'verification-selfies storage bounds do not match the reviewed contract';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id = 'chat-media'
      and public = false
      and file_size_limit = 20971520
      and allowed_mime_types @> expected_chat
      and expected_chat @> allowed_mime_types
  ) then
    raise exception 'chat-media storage bounds do not match the reviewed contract';
  end if;
end $$;

commit;
