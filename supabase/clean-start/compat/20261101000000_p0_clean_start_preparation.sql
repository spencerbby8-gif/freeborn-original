-- CLEAN-START COMPATIBILITY ONLY. Never apply this file to Production.
-- The preserved 2026-10-16 migration and the preserved 2026-11-01 P0 migration
-- both add this same constraint. A clean replay retains both history entries;
-- P0 recreates the identical final constraint immediately after this step.
alter table public.user_profiles
  drop constraint if exists user_profiles_min_age_check;
