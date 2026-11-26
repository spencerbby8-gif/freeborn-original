-- Mutual-Filter Vault (additive): encrypted private preference payloads plus
-- HMAC equality digests, so the server can find members who chose the SAME
-- value for the SAME key without storing or reading plaintext for anyone else.
-- Approved design v1.2 (2026-11-26). Nothing existing is modified, renamed or
-- dropped. There is no policy for `authenticated` ON PURPOSE: members reach
-- the Vault only through the API, which enforces mutual visibility server-side
-- (design rule 6), so RLS stays default-deny for anon/authenticated.

create table public.vault_entries (
  user_id             uuid primary key references public.user_profiles(id) on delete cascade,
  consent_accepted_at timestamptz not null,
  consent_version     text not null,
  payload             text not null,
  key_version         integer not null default 1,
  updated_at          timestamptz not null default timezone('utc', now()),
  constraint vault_entries_key_version_check check (key_version >= 1),
  constraint vault_entries_consent_version_check check (consent_version <> '')
);

create table public.vault_match_keys (
  user_id      uuid not null references public.user_profiles(id) on delete cascade,
  pref_key     text not null,
  value_digest character(64) not null,
  created_at   timestamptz not null default timezone('utc', now()),
  primary key (user_id, pref_key),
  constraint vault_match_keys_pref_key_check check (pref_key <> ''),
  constraint vault_match_keys_digest_check check (char_length(value_digest) = 64)
);

create index vault_match_keys_lookup_idx on public.vault_match_keys (pref_key, value_digest);

alter table public.vault_entries enable row level security;
alter table public.vault_entries force row level security;
alter table public.vault_match_keys enable row level security;
alter table public.vault_match_keys force row level security;

-- Server runtime access follows the exact pattern of
-- 20261122000000_member_notification_delivery.sql (conditional grants plus a
-- server_access policy for freeborn_runtime only).
do $$ begin
  if exists(select 1 from pg_roles where rolname = 'freeborn_runtime') then
    execute format('grant select,insert,update,delete on public.%I to freeborn_runtime', 'vault_entries');
    execute format('grant select,insert,update,delete on public.%I to freeborn_runtime', 'vault_match_keys');
    execute format('create policy server_access on public.%I for all to freeborn_runtime using (true) with check (true)', 'vault_entries');
    execute format('create policy server_access on public.%I for all to freeborn_runtime using (true) with check (true)', 'vault_match_keys');
  end if;
end $$;

-- Privileges are revoked to keep the clean-replay anon_grants=0 verification
-- honest (pattern of 20260712120000_premium_onboarding_location_safety.sql).
revoke all on public.vault_entries from anon, authenticated;
revoke all on public.vault_match_keys from anon, authenticated;

-- service_role is deliberately NOT granted: per decision H4 admins have no
-- vault access — no grants, no policies, no routes, not even decrypted.
