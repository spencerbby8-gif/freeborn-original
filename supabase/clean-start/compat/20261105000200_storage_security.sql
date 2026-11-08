-- Bounded storage policy for a clean non-production replay.
begin;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('profile-photos','profile-photos',true,8388608,array['image/jpeg','image/png','image/webp']),
  ('verification-selfies','verification-selfies',false,6291456,array['image/jpeg','image/png','image/webp']),
  ('chat-media','chat-media',false,20971520,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
commit;
