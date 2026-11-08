-- Phase 3: Discovery, photos, matching, and messaging foundation

-- Extend user_profiles with discovery-ready fields
alter table public.user_profiles
  add column if not exists height_cm integer,
  add column if not exists prompt_answers jsonb not null default '[]'::jsonb,
  add column if not exists show_gender text[] not null default '{}'::text[],
  add column if not exists age_min_preference integer not null default 22,
  add column if not exists age_max_preference integer not null default 45,
  add column if not exists max_distance_km integer not null default 80,
  add column if not exists discoverable boolean not null default true,
  add column if not exists last_active_at timestamptz not null default timezone('utc', now()),
  add column if not exists photo_count integer not null default 0,
  add column if not exists verified_photo boolean not null default false;

alter table public.user_profiles
  drop constraint if exists user_profiles_height_check,
  add constraint user_profiles_height_check check (height_cm is null or (height_cm between 120 and 230));

alter table public.user_profiles
  drop constraint if exists user_profiles_age_preference_check,
  add constraint user_profiles_age_preference_check check (age_min_preference >= 18 and age_max_preference >= age_min_preference and age_max_preference <= 99);

alter table public.user_profiles
  drop constraint if exists user_profiles_distance_check,
  add constraint user_profiles_distance_check check (max_distance_km between 5 and 500);

-- Profile photos
create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  storage_path text not null,
  blurhash text,
  width integer,
  height integer,
  position integer not null default 0,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_photos_position_check check (position between 0 and 8),
  constraint profile_photos_path_unique unique (storage_path)
);

create index if not exists profile_photos_user_position_idx on public.profile_photos (user_id, position);
create index if not exists profile_photos_user_primary_idx on public.profile_photos (user_id) where is_primary = true;

create trigger profile_photos_touch_updated_at
before update on public.profile_photos
for each row execute function public.touch_updated_at();

alter table public.profile_photos enable row level security;

drop policy if exists "Users can view discoverable photos" on public.profile_photos;
create policy "Users can view discoverable photos"
on public.profile_photos for select
using (
  true
);

drop policy if exists "Users manage own photos" on public.profile_photos;
create policy "Users manage own photos"
on public.profile_photos for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Discovery preferences (separate table for future extensibility, mirrored in user_profiles for speed)
create table if not exists public.discovery_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  age_min integer not null default 22,
  age_max integer not null default 45,
  distance_km integer not null default 80,
  show_genders text[] not null default '{woman,man,non_binary}'::text[],
  relationship_intents text[] not null default '{long_term,meaningful_connection,life_partner}'::text[],
  deal_breaker_strict boolean not null default true,
  verified_only boolean not null default false,
  photos_required boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint discovery_preferences_age_check check (age_min >= 18 and age_max >= age_min and age_max <= 99),
  constraint discovery_preferences_distance_check check (distance_km between 5 and 500)
);

create trigger discovery_preferences_touch_updated_at
before update on public.discovery_preferences
for each row execute function public.touch_updated_at();

alter table public.discovery_preferences enable row level security;

create policy "Users manage own discovery preferences"
on public.discovery_preferences for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Discovery preferences readable by owner"
on public.discovery_preferences for select
using (auth.uid() = user_id);

-- Swipes / likes
create table if not exists public.user_swipes (
  liker_id uuid not null references public.user_profiles(id) on delete cascade,
  liked_id uuid not null references public.user_profiles(id) on delete cascade,
  action text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_swipes_pkey primary key (liker_id, liked_id),
  constraint user_swipes_no_self check (liker_id <> liked_id),
  constraint user_swipes_action_check check (action in ('like', 'pass', 'superlike'))
);

create index if not exists user_swipes_liker_idx on public.user_swipes (liker_id, created_at desc);
create index if not exists user_swipes_liked_idx on public.user_swipes (liked_id, created_at desc);
create index if not exists user_swipes_action_idx on public.user_swipes (action);

alter table public.user_swipes enable row level security;

create policy "Users can insert own swipes"
on public.user_swipes for insert
with check (auth.uid() = liker_id);

create policy "Users can view own swipes"
on public.user_swipes for select
using (auth.uid() = liker_id or auth.uid() = liked_id);

create policy "Users can update own swipes"
on public.user_swipes for update
using (auth.uid() = liker_id)
with check (auth.uid() = liker_id);

-- Matches
create table if not exists public.user_matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.user_profiles(id) on delete cascade,
  user_b uuid not null references public.user_profiles(id) on delete cascade,
  initiated_by uuid references public.user_profiles(id) on delete set null,
  status text not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_matches_pair_unique unique (user_a, user_b),
  constraint user_matches_no_self check (user_a <> user_b),
  constraint user_matches_ordered check (user_a < user_b),
  constraint user_matches_status_check check (status in ('active','archived','blocked'))
);

create index if not exists user_matches_user_a_idx on public.user_matches (user_a, created_at desc);
create index if not exists user_matches_user_b_idx on public.user_matches (user_b, created_at desc);

alter table public.user_matches enable row level security;

create policy "Users see their matches"
on public.user_matches for select
using (auth.uid() = user_a or auth.uid() = user_b);

create policy "System can manage matches"
on public.user_matches for insert
with check (auth.uid() = user_a or auth.uid() = user_b or auth.uid() = initiated_by);

create policy "Users can update their matches"
on public.user_matches for update
using (auth.uid() = user_a or auth.uid() = user_b)
with check (auth.uid() = user_a or auth.uid() = user_b);

-- Messages (premium, simple to start)
create table if not exists public.match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.user_matches(id) on delete cascade,
  sender_id uuid not null references public.user_profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint match_messages_body_length check (char_length(body) between 1 and 2000)
);

create index if not exists match_messages_match_created_idx on public.match_messages (match_id, created_at desc);
create index if not exists match_messages_sender_idx on public.match_messages (sender_id, created_at desc);

alter table public.match_messages enable row level security;

create policy "Match participants can read messages"
on public.match_messages for select
using (
  exists (
    select 1 from public.user_matches m
    where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid())
  )
);

create policy "Match participants can send messages"
on public.match_messages for insert
with check (
  sender_id = auth.uid() and exists (
    select 1 from public.user_matches m
    where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()) and m.status = 'active'
  )
);

-- Helpers
create or replace function public.user_age(birth date)
returns integer
language sql
immutable
as $$
  select case
    when birth is null then null
    else date_part('year', age(current_date, birth))::int
  end;
$$;

-- Discover feed function
create or replace function public.discover_candidates(p_user uuid, p_limit int default 24, p_offset int default 0)
returns table (
  id uuid,
  display_name text,
  bio text,
  city text,
  region text,
  country_code char(2),
  gender text,
  birth_date date,
  age integer,
  relationship_goals text[],
  interests text[],
  lifestyle_preferences text[],
  occupation text,
  education text,
  is_verified boolean,
  photo_count integer,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select
      up.*,
      coalesce(dp.show_genders, up.show_gender, array['woman','man','non_binary']::text[]) as show_genders,
      coalesce(dp.age_min, up.age_min_preference, 18) as age_min,
      coalesce(dp.age_max, up.age_max_preference, 99) as age_max,
      coalesce(dp.verified_only, false) as verified_only,
      coalesce(dp.photos_required, true) as photos_required
    from public.user_profiles up
    left join public.discovery_preferences dp on dp.user_id = up.id
    where up.id = p_user
  )
  select
    c.id,
    c.display_name,
    c.bio,
    c.city,
    c.region,
    c.country_code,
    c.gender,
    c.birth_date,
    public.user_age(c.birth_date) as age,
    c.relationship_goals,
    c.interests,
    c.lifestyle_preferences,
    c.occupation,
    c.education,
    c.is_verified,
    c.photo_count,
    c.last_active_at
  from public.user_profiles c, me
  where c.id <> me.id
    and c.profile_status = 'active'
    and c.discoverable = true
    and c.onboarding_stage in ('profile_setup','ready')
    and (me.show_genders = '{}' or c.gender = any(me.show_genders))
    and public.user_age(c.birth_date) between me.age_min and me.age_max
    and (not me.verified_only or c.is_verified = true)
    and (not me.photos_required or c.photo_count > 0)
    and not exists (
      select 1 from public.user_swipes s
      where s.liker_id = me.id and s.liked_id = c.id and s.action in ('like','pass','superlike')
    )
  order by
    c.is_verified desc,
    c.last_active_at desc nulls last,
    c.created_at desc
  limit greatest(p_limit,1)
  offset greatest(p_offset,0);
$$;

grant execute on function public.discover_candidates(uuid, int, int) to authenticated, anon;

-- Match creation trigger
create or replace function public.handle_mutual_swipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_match_id uuid;
begin
  if new.action not in ('like','superlike') then
    return new;
  end if;

  if exists (
    select 1 from public.user_swipes s
    where s.liker_id = new.liked_id
      and s.liked_id = new.liker_id
      and s.action in ('like','superlike')
  ) then
    v_user_a := least(new.liker_id, new.liked_id);
    v_user_b := greatest(new.liker_id, new.liked_id);

    insert into public.user_matches (user_a, user_b, initiated_by, status)
    values (v_user_a, v_user_b, new.liker_id, 'active')
    on conflict (user_a, user_b) do nothing
    returning id into v_match_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_user_swipe_match on public.user_swipes;
create trigger on_user_swipe_match
after insert on public.user_swipes
for each row execute function public.handle_mutual_swipe();

-- Keep photo_count in sync
create or replace function public.refresh_profile_photo_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.user_profiles
      set photo_count = (
        select count(*) from public.profile_photos p where p.user_id = old.user_id
      ),
      updated_at = timezone('utc', now())
    where id = old.user_id;
    return old;
  else
    update public.user_profiles
      set photo_count = (
        select count(*) from public.profile_photos p where p.user_id = new.user_id
      ),
      updated_at = timezone('utc', now())
    where id = new.user_id;
    return new;
  end if;
end;
$$;

drop trigger if exists profile_photos_count_sync_insert on public.profile_photos;
create trigger profile_photos_count_sync_insert
after insert or update on public.profile_photos
for each row execute function public.refresh_profile_photo_count();

drop trigger if exists profile_photos_count_sync_delete on public.profile_photos;
create trigger profile_photos_count_sync_delete
after delete on public.profile_photos
for each row execute function public.refresh_profile_photo_count();

-- Primary photo uniqueness enforcement
create unique index if not exists profile_photos_one_primary_per_user
  on public.profile_photos (user_id)
  where is_primary = true;

-- Ensure discovery_preferences row exists for new profiles
create or replace function public.ensure_discovery_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.discovery_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists user_profiles_ensure_discovery_preferences on public.user_profiles;
create trigger user_profiles_ensure_discovery_preferences
after insert on public.user_profiles
for each row execute function public.ensure_discovery_preferences();

-- Backfill discovery_preferences for existing users
insert into public.discovery_preferences (user_id)
select id from public.user_profiles
on conflict (user_id) do nothing;

-- Update photo_count for existing users
update public.user_profiles up
set photo_count = coalesce(pc.c, 0)
from (
  select user_id, count(*) as c
  from public.profile_photos
  group by user_id
) pc
where pc.user_id = up.id;

-- Storage bucket for profile photos (idempotent via storage API normally, add RLS)
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Storage RLS
-- public read
drop policy if exists "Public read profile photos" on storage.objects;
create policy "Public read profile photos"
on storage.objects for select
using (bucket_id = 'profile-photos');

-- users can upload to their own folder
drop policy if exists "Users upload own profile photos" on storage.objects;
create policy "Users upload own profile photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own profile photos" on storage.objects;
create policy "Users update own profile photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own profile photos" on storage.objects;
create policy "Users delete own profile photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: allow users to see other active discoverable profiles
drop policy if exists "Discoverable profiles are visible" on public.user_profiles;
create policy "Discoverable profiles are visible"
on public.user_profiles
for select
using (
  auth.uid() = id
  or (
    profile_status = 'active'
    and discoverable = true
    and onboarding_stage in ('profile_setup', 'ready')
  )
);

-- helpful view
create or replace view public.profile_with_photos as
select
  up.*,
  public.user_age(up.birth_date) as age,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', pp.id,
          'storage_path', pp.storage_path,
          'position', pp.position,
          'is_primary', pp.is_primary,
          'width', pp.width,
          'height', pp.height
        ) order by pp.position, pp.created_at
      )
      from public.profile_photos pp
      where pp.user_id = up.id
    ),
    '[]'::jsonb
  ) as photos
from public.user_profiles up;

grant select on public.profile_with_photos to authenticated, anon;

-- bump last_active
create or replace function public.touch_last_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
    set last_active_at = timezone('utc', now())
    where id = auth.uid();
  return new;
end;
$$;

drop trigger if exists user_swipes_touch_active on public.user_swipes;
create trigger user_swipes_touch_active
after insert on public.user_swipes
for each row execute function public.touch_last_active();

