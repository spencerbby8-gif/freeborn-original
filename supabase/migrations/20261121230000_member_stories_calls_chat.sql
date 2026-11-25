-- Owner approval required before production. Additive; no existing messages removed.
begin;
alter table public.call_sessions add column if not exists ended_by uuid references public.user_profiles(id) on delete set null;
alter table public.call_sessions add column if not exists end_reason text;
create table public.conversation_preferences (
 user_id uuid not null references public.user_profiles(id) on delete cascade,
 match_id uuid not null references public.matches(id) on delete cascade,
 nickname text check (char_length(nickname) between 1 and 40),
 archived boolean not null default false, hidden boolean not null default false,
 pinned boolean not null default false, updated_at timestamptz not null default now(), primary key(user_id,match_id)
);
create table public.story_preferences (
 user_id uuid primary key references public.user_profiles(id) on delete cascade,
 audience text not null default 'all' check (audience in ('all','exclude','only')),
 selected_ids jsonb not null default '[]' check (jsonb_typeof(selected_ids)='array' and jsonb_array_length(selected_ids)<=500),
 updated_at timestamptz not null default now()
);
create table public.member_stories (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.user_profiles(id) on delete cascade,
 caption text not null default '' check (char_length(caption)<=280),
 image_base64 text not null check (octet_length(image_base64) between 1 and 1400000),
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '24 hours'),
 check (expires_at=created_at+interval '24 hours')
);
create index member_stories_author_expiry_idx on public.member_stories(author_id,expires_at);
create table public.story_views (
 story_id uuid not null references public.member_stories(id) on delete cascade,
 viewer_id uuid not null references public.user_profiles(id) on delete cascade,
 viewed_at timestamptz not null default now(), primary key(story_id,viewer_id)
);
create table public.story_quotes (
 message_id uuid primary key references public.messages(id) on delete cascade,
 story_id uuid references public.member_stories(id) on delete set null,
 author_id uuid not null references public.user_profiles(id) on delete cascade,
 image_base64 text not null check (octet_length(image_base64) between 1 and 1400000),
 sender_id uuid not null references public.user_profiles(id) on delete cascade,
 client_id uuid not null, caption text not null default '', unique(sender_id,client_id)
);
create table public.story_upload_receipts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.user_profiles(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index story_upload_receipts_user_time_idx on public.story_upload_receipts(user_id,created_at);
alter table public.story_upload_receipts enable row level security;
revoke all on public.story_upload_receipts from public,anon,authenticated;
grant all on public.story_upload_receipts to service_role;
-- Browser clients use authenticated API routes only. RLS is a second fail-closed boundary.
alter table public.conversation_preferences enable row level security;
alter table public.story_preferences enable row level security;
alter table public.member_stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_quotes enable row level security;
revoke all on public.conversation_preferences, public.story_preferences, public.member_stories, public.story_views, public.story_quotes from public,anon,authenticated;
grant all on public.conversation_preferences, public.story_preferences, public.member_stories, public.story_views, public.story_quotes to service_role;
alter table public.conversation_preferences force row level security;
alter table public.story_preferences force row level security;
alter table public.member_stories force row level security;
alter table public.story_views force row level security;
alter table public.story_quotes force row level security;
alter table public.story_upload_receipts force row level security;
-- Authoritative read-time expiry does NOT depend on this cleanup job. Quotes are private
-- copies in chat_media, deliberately retained per the posting disclosure and owner choice.
create or replace function public.purge_expired_member_stories() returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare removed bigint;
begin
 delete from public.member_stories where expires_at<=now();
 get diagnostics removed = row_count;
 delete from public.story_upload_receipts where created_at < now()-interval '24 hours';
 return removed;
end $$;
revoke all on function public.purge_expired_member_stories() from public,anon,authenticated;
grant execute on function public.purge_expired_member_stories() to service_role;
commit;
