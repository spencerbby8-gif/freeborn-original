-- Harden the onboarding_step check constraint to cover every step
-- value used by both the premium web flow and the mobile flow.
-- Also add an explicit NOT NULL guard and trim any stale NULLs.

-- Ensure no rows have a NULL onboarding_step (safety backfill).
update public.user_profiles
  set onboarding_step = 'welcome'
  where onboarding_step is null;

-- Recreate the check constraint with the complete value set.
alter table public.user_profiles
  drop constraint if exists user_profiles_onboarding_step_check,
  add constraint user_profiles_onboarding_step_check
    check (
      onboarding_step in (
        -- Premium web flow steps
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
        -- Legacy mobile flow steps (retained for compatibility)
        'about_you',
        'bio_goals',
        'interests_lifestyle',
        'preferences_extras',
        'complete'
      )
    );

-- Ensure onboarding_step column has a safe default.
alter table public.user_profiles
  alter column onboarding_step set default 'welcome';
