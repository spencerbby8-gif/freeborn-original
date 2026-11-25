-- Owner approval required before production. Personal story-feed preferences only.
begin;
create table public.hidden_story_authors (
 viewer_id uuid not null references public.user_profiles(id) on delete cascade,
 author_id uuid not null references public.user_profiles(id) on delete cascade,
 hidden_at timestamptz not null default now(),
 primary key (viewer_id, author_id),
 constraint hidden_story_authors_no_self check (viewer_id <> author_id)
);
alter table public.hidden_story_authors enable row level security;
alter table public.hidden_story_authors force row level security;
revoke all on public.hidden_story_authors from public, anon, authenticated;
grant all on public.hidden_story_authors to service_role;
commit;
