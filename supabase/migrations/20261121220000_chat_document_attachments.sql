-- Add download-only documents without altering participant authorization or storage.
-- Deploy BEFORE the matching chat-media handler. No existing rows are rewritten.
begin;
alter table public.chat_media drop constraint if exists chat_media_kind_check;
alter table public.chat_media add constraint chat_media_kind_check
  check (kind in ('image', 'video', 'voice', 'file'));
commit;
