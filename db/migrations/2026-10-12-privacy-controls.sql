-- ============================================================================
-- FREEBORN PRIVACY CONTROLS (ARC 2.4, 2026-10-12)
-- ============================================================================
-- Extends public.user_private_settings with the researched dating-app privacy
-- controls (Tinder "show me"/Recently-Active, Bumble Snooze/Incognito, Grindr
-- hide-distance, read receipts — see ARC2-UI-ELEVATION-PLAN.md §S5):
--   discovery_paused    (column already existed — now wired into the deck)
--   incognito           — only members I've liked / matched with can see me
--   hide_distance       — city shown, exact distance hidden (anti-triangulation)
--   hide_active_status  — presence dot hidden from others
--   read_receipts       — whether others see that I read their messages
--
-- All additive, all with safe defaults that preserve current behavior
-- (paused=false, incognito=false, hide_*=false, receipts=true).
-- Apply with the project owner connection (transaction pooler).
-- ============================================================================

alter table public.user_private_settings
  add column if not exists incognito boolean not null default false,
  add column if not exists hide_distance boolean not null default false,
  add column if not exists hide_active_status boolean not null default false,
  add column if not exists read_receipts boolean not null default true;

comment on column public.user_private_settings.incognito is
  'Incognito mode: the member only appears in decks of members they liked or matched with.';
comment on column public.user_private_settings.hide_distance is
  'Hide exact distance from others; city is still shown.';
comment on column public.user_private_settings.hide_active_status is
  'Hide the online/active presence indicator from others.';
comment on column public.user_private_settings.read_receipts is
  'When false, senders do not see that this member read their messages.';
