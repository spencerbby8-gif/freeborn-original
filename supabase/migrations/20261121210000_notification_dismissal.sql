-- Additive, pending review/application. Does not delete notifications or messages.
-- The existing notification_preferences owner/runtime RLS policies apply unchanged.
-- NULL preserves every member's current notification feed.
alter table public.notification_preferences
  add column if not exists dismissed_before timestamptz;
comment on column public.notification_preferences.dismissed_before is
  'Server timestamp through which the member explicitly cleared notification cards; not message read state.';
