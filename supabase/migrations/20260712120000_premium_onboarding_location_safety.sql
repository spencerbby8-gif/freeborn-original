-- Premium onboarding phase: private location, expanded step tracking, and distance-aware discovery.

alter table public.user_profiles
  alter column onboarding_step set default 'welcome';

alter table public.user_profiles
  drop constraint if exists user_profiles_onboarding_step_check,
  add constraint user_profiles_onboarding_step_check
    check (
      onboarding_step in (
        'welcome',
        'identity',
        'location',
        'intent',
        'relationship_intent',
        'lifestyle',
        'values',
        'interests',
        'bio',
        'photos',
        'discovery_preferences',
        'verification',
        'finish',
        -- legacy steps retained for existing clients/rows
        'about_you',
        'bio_goals',
        'interests_lifestyle',
        'preferences_extras',
        'complete'
      )
    );

create table if not exists public.user_private_locations (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  source text not null default 'manual',
  city text,
  region text,
  country_code char(2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_private_locations_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint user_private_locations_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint user_private_locations_accuracy_check check (accuracy_m is null or accuracy_m between 0 and 100000),
  constraint user_private_locations_source_check check (source in ('manual', 'gps')),
  constraint user_private_locations_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

create trigger user_private_locations_touch_updated_at
before update on public.user_private_locations
for each row execute function public.touch_updated_at();

alter table public.user_private_locations enable row level security;

revoke all on public.user_private_locations from anon, authenticated;
grant select, insert, update, delete on public.user_private_locations to authenticated;

drop policy if exists "Users manage own private location" on public.user_private_locations;
create policy "Users manage own private location"
on public.user_private_locations for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists user_profiles_values_idx
  on public.user_profiles using gin (values);

create or replace function public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(
    sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lon2 - lon1) / 2)), 2)
    )
  );
$$;

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
      mpl.latitude as my_latitude,
      mpl.longitude as my_longitude,
      coalesce(dp.show_genders, up.show_gender, array['woman','man','non_binary']::text[]) as show_genders,
      coalesce(dp.age_min, up.age_min_preference, 18) as age_min,
      coalesce(dp.age_max, up.age_max_preference, 99) as age_max,
      coalesce(dp.distance_km, up.max_distance_km, 80) as distance_km,
      coalesce(dp.verified_only, false) as verified_only,
      coalesce(dp.photos_required, true) as photos_required
    from public.user_profiles up
    left join public.discovery_preferences dp on dp.user_id = up.id
    left join public.user_private_locations mpl on mpl.user_id = up.id
    where up.id = p_user
  ), candidates as (
    select
      c.*,
      cpl.latitude as candidate_latitude,
      cpl.longitude as candidate_longitude,
      case
        when me.my_latitude is not null
          and me.my_longitude is not null
          and cpl.latitude is not null
          and cpl.longitude is not null
        then public.haversine_km(me.my_latitude, me.my_longitude, cpl.latitude, cpl.longitude)
        else null
      end as distance_km_from_me,
      me.age_min as searcher_age_min,
      me.age_max as searcher_age_max,
      me.show_genders as searcher_show_genders,
      me.verified_only as searcher_verified_only,
      me.photos_required as searcher_photos_required,
      me.distance_km as searcher_max_distance_km
    from public.user_profiles c
    cross join me
    left join public.user_private_locations cpl on cpl.user_id = c.id
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
  from candidates c
  where c.id <> p_user
    and c.profile_status = 'active'
    and c.discoverable = true
    and c.onboarding_stage in ('profile_setup','ready')
    and (c.searcher_show_genders = '{}' or c.gender = any(c.searcher_show_genders))
    and public.user_age(c.birth_date) between c.searcher_age_min and c.searcher_age_max
    and (not c.searcher_verified_only or c.is_verified = true)
    and (not c.searcher_photos_required or c.photo_count > 0)
    and (c.distance_km_from_me is null or c.distance_km_from_me <= c.searcher_max_distance_km)
    and not exists (
      select 1 from public.user_swipes s
      where s.liker_id = p_user and s.liked_id = c.id and s.action in ('like','pass','superlike')
    )
  order by
    c.distance_km_from_me asc nulls last,
    c.is_verified desc,
    c.last_active_at desc nulls last,
    c.created_at desc
  limit greatest(p_limit,1)
  offset greatest(p_offset,0);
$$;

grant execute on function public.discover_candidates(uuid, int, int) to authenticated, anon;
