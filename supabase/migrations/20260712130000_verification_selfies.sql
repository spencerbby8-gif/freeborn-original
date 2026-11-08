-- Premium verification selfie attempts and private storage.

create table if not exists public.verification_selfie_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  storage_path text not null,
  pose_id text not null,
  pose_asset_path text not null,
  status text not null default 'pending',
  score numeric,
  gemini_result jsonb not null default '{}'::jsonb,
  feedback text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint verification_selfie_checks_status_check check (status in ('pending','approved','failed','error')),
  constraint verification_selfie_checks_storage_path_unique unique (storage_path)
);

create index if not exists verification_selfie_checks_user_created_idx
  on public.verification_selfie_checks (user_id, created_at desc);

create trigger verification_selfie_checks_touch_updated_at
before update on public.verification_selfie_checks
for each row execute function public.touch_updated_at();

alter table public.verification_selfie_checks enable row level security;

create policy "Users can view own verification checks"
on public.verification_selfie_checks for select
using (auth.uid() = user_id);

create policy "Users can insert own verification checks"
on public.verification_selfie_checks for insert
with check (auth.uid() = user_id);

create policy "Users can update own verification checks"
on public.verification_selfie_checks for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('verification-selfies', 'verification-selfies', false)
on conflict (id) do update set public = false;

-- No public read policy. Members can only manage objects inside their own private folder.
drop policy if exists "Users upload own verification selfies" on storage.objects;
create policy "Users upload own verification selfies"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users read own verification selfies" on storage.objects;
create policy "Users read own verification selfies"
on storage.objects for select
to authenticated
using (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own verification selfies" on storage.objects;
create policy "Users update own verification selfies"
on storage.objects for update
to authenticated
using (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own verification selfies" on storage.objects;
create policy "Users delete own verification selfies"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'verification-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);
