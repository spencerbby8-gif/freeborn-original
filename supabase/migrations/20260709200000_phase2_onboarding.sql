-- Phase 2: onboarding and profile foundation
-- Adds profile fields for the multi-step onboarding flow and tracks
-- onboarding progress per user.

alter table public.user_profiles
  add column if not exists display_name text,
  add column if not exists gender text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists lifestyle_preferences text[] not null default '{}',
  add column if not exists deal_breakers text[] not null default '{}',
  add column if not exists occupation text,
  add column if not exists education text,
  add column if not exists onboarding_step text not null default 'identity',
  add column if not exists relationship_goals text[] not null default '{}';

alter table public.user_profiles
  drop constraint if exists user_profiles_gender_check,
  add constraint user_profiles_gender_check
    check (
      gender is null
      or gender in (
        'woman',
        'man',
        'non_binary',
        'genderqueer',
        'genderfluid',
        'agender',
        'two_spirit',
        'prefer_to_self_describe',
        'prefer_not_to_say'
      )
    );

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
        'about_you',
        'bio_goals',
        'interests_lifestyle',
        'preferences_extras',
        'complete'
      )
    );

alter table public.user_profiles
  drop constraint if exists user_profiles_display_name_length,
  add constraint user_profiles_display_name_length
    check (display_name is null or length(display_name) between 2 and 40);

create index if not exists user_profiles_gender_idx
  on public.user_profiles (gender);

create index if not exists user_profiles_interests_idx
  on public.user_profiles using gin (interests);

create index if not exists user_profiles_lifestyle_preferences_idx
  on public.user_profiles using gin (lifestyle_preferences);

create index if not exists user_profiles_deal_breakers_idx
  on public.user_profiles using gin (deal_breakers);

create index if not exists user_profiles_onboarding_step_idx
  on public.user_profiles (onboarding_step);
