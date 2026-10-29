-- FREEBORN — identity duplication, device linkage, graduated enforcement, human challenge
-- Design inputs come from client-side reverse engineering of the three largest dating
-- services (see RE-MECHANICS.md): Tinder's `persistent-device-id` + enforcement taxonomy
-- (WARNING/SUPPRESSION/SUSPENSION/BAN, VIOLATING_* classes, `case/warnings/acknowledge`,
-- `banned-user/appeals` + Arkose challenge token), Hinge's cross-profile duplicate-face
-- scan, Bumble's Deception Detector ("act before the user sees the profile" + human review).
--
-- DELIBERATE DEVIATIONS from the recovered designs, stated so nobody mistakes them for
-- oversights:
--   * NO biometric template is stored. Tinder/Hinge keep a face map/vector; Freeborn has no
--     face-matching model of its own and will not invent one. Cross-account identity is
--     derived from *the member's own photos* (perceptual hash) plus the existing dual-vision
--     engine verdicts, which is the closest faithful analogue this architecture can support
--     without pretending to a capability it does not have.
--   * NO browser fingerprinting. The device id is a random per-install UUID the client
--     chooses to send (Tinder/Bumble both key on a client-held id too); we never read
--     canvas/WebGL/audio to derive it.
--   * Duplication is NEVER auto-destructive. It sets a review flag + trust penalty. Only the
--     existing dual-engine rules (`src/lib/moderation.ts`) may escalate, and reports alone
--     still never ban.
--
-- APPLIED to live project ihwtpwlszegrjgakqsxx via the Supabase migration API as
-- "freeborn_identity_enforcement_2026_10_28" (see the record at the bottom of this file).

begin;

/* ------------------------------------------------------------------ 1. photo hash -- */
/* dHash (64 bits, difference hash) catches re-saves/resizes/recompression.
   aHash (64 bits, average hash) catches crops-away-and-reframe and recolour.
   Both are computed server-side from the bytes already stored in
   public.chat_media, at upload time.

   STORAGE FORMAT IS 16-CHAR LOWERCASE HEX (char(16)), not bit(64). The reason is a real
   production bug this file originally contained: the app (src/lib/photo-hash.ts) produces
   64-bit hashes as 16-hex-char strings and the first version of this migration declared the
   columns bit(64), so EVERY INSERT FROM EVERY ROUTE WOULD HAVE FAILED with
   `error: "d" is not a valid binary digit` (22P02, bit_in) — caught only by running the real
   write path against the live database (scripts/trust/live-proof.ts), and now asserted by
   scripts/trust/harness.ts ("live column types match the app's hash encoding").
   Postgres can still do native popcount: hamming64() casts the hex to bit(64) internally.
   char(16) is chosen over text so the length is enforced by the type, not by a check. */
alter table public.profile_photos
  add column if not exists phash_d char(16),
  add column if not exists phash_a char(16),
  add column if not exists phash_bytes char(64),
  add column if not exists phash_at timestamptz;

comment on column public.profile_photos.phash_d is
  'difference-hash of the stored bytes, 64-bit, as 16 hex chars. Computed on upload. Used for cross-account duplicate-photo detection only.';
comment on column public.profile_photos.phash_bytes is
  'sha256 of the exact uploaded bytes, as 64 hex chars. Catches byte-identical re-uploads that a crop defeats: a global perceptual hash diverges past a ~5% crop (measured), so the exact-bytes hash is the only thing that reliably links a re-upload of the SAME FILE across accounts.';

/* ------------------------------------------------------------------ 2. identity fingerprints -- */
create table if not exists public.identity_fingerprints (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.user_profiles (id) on delete cascade,
  source                text not null,
  photo_dhash           char(16),
  photo_ahash           char(16),
  -- Composite identity anchor: a deterministic bit string derived from the member's photo
  -- hashes at verification time. NOT a biometric template: it is re-derivable from the
  -- photos and stores nothing about a face.
  anchor                char(16) not null,
  selfie_check_id       uuid,
  engine_decision       text,
  engine_confidence     text,
  created_at            timestamptz not null default timezone('utc', now()),
  constraint identity_fingerprints_source_check
    check (source in ('verification', 'photo_upload', 'backfill')),
  constraint identity_fingerprints_decision_check
    check (engine_decision is null or engine_decision in ('match','mismatch','unclear')),
  constraint identity_fingerprints_confidence_check
    check (engine_confidence is null or engine_confidence in ('high','medium','low','unknown'))
);
create index if not exists identity_fingerprints_user_idx    on public.identity_fingerprints (user_id, created_at desc);
create index if not exists identity_fingerprints_anchor_idx on public.identity_fingerprints (anchor);
create index if not exists identity_fingerprints_dhash_idx   on public.identity_fingerprints (photo_dhash);

/* ------------------------------------------------------------------ 3. device linkage -- */
create table if not exists public.account_devices (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.user_profiles (id) on delete cascade,
  device_hash       char(16) not null,     -- sha256(install-uuid) truncated to 8 bytes, hex; never the raw id
  first_seen_at     timestamptz not null default timezone('utc', now()),
  last_seen_at      timestamptz not null default timezone('utc', now()),
  seen_count        integer not null default 1,
  -- Cadence signal, modelled on Tinder's app/user-session-elapsed headers: how long the
  -- client claims this install has existed vs how long this account has.
  install_age_ms    bigint,
  constraint account_devices_one_row_per_pair unique (user_id, device_hash)
);
create index if not exists account_devices_hash_idx on public.account_devices (device_hash, last_seen_at desc);

/* ------------------------------------------------------------------ 4. enforcement cases -- */
/* The tier ladder recovered from Tinder's client:
     warning -> suppression -> suspension -> ban
   Freeborn previously had suspend-or-nothing, which forces the operator to either do
   nothing or end an account. Suppression ("reduced visibility") is the reversible middle
   tier and is what makes acting on a *signal* proportionate. */
create table if not exists public.enforcement_cases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.user_profiles (id) on delete cascade,
  email           citext,
  tier            text not null,
  state           text not null default 'open',
  violated_class  text not null,
  code            text not null,
  -- Evidence, not accusation: what the system observed. `notes` is what a member may be told.
  detail          text,
  notes           text,
  trust_delta     integer not null default 0,
  -- Every removal kind gets its own resolution code, as in the recovered taxonomy.
  resolution      text,
  opened_by       text not null,
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  due_at          timestamptz,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  constraint enforcement_cases_tier_check
    check (tier in ('warning','suppression','suspension','ban')),
  constraint enforcement_cases_state_check
    check (state in ('open','in_review','acknowledged','appealable','resolved')),
  constraint enforcement_cases_class_check
    check (violated_class in ('violation_personal_content','violation_profile_content',
                               'violation_media','violation_behavior','violation_identity')),
  constraint enforcement_cases_resolution_check
    check (resolution is null or resolution in ('denied','warning_removed','content_reinstated',
                                                'suppression_removed','suspension_removed','ban_removed')),
  constraint enforcement_cases_actor_check
    check (opened_by in ('system','identity_engine','moderation_engine','operator','member_report')),
  -- At most one live case per (member, tier). Prevents a warning storm from the same signal
  -- firing repeatedly, which is exactly how a heuristic becomes harassment.
  constraint enforcement_cases_one_live_per_tier
    unique (user_id, tier, state)
);
create index if not exists enforcement_cases_user_idx  on public.enforcement_cases (user_id, created_at desc);
create index if not exists enforcement_cases_open_idx  on public.enforcement_cases (state, tier) where state in ('open','in_review');
create index if not exists enforcement_cases_email_idx on public.enforcement_cases (email);

/* ------------------------------------------------------------------ 5. appeal human challenge -- */
/* Tinder files an appeal through POST /v1/appeals carrying an Arkose token held in
   `appealChallengeToken`. We have no captcha provider configured on this project, so we
   implement the *seam* honestly: a nonce the member must solve with real work/time, and a
   verification endpoint that consumes it. When a provider is added later it plugs into the
   same column pair. */
create table if not exists public.human_challenges (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  purpose      text not null,
  token_hash   char(16) not null,
  nonce        text not null unique,      -- server-issued random; recompute target, not member data
  difficulty_bits integer not null default 20,
  status       text not null default 'issued',
  attempts     integer not null default 0,
  issued_at    timestamptz not null default timezone('utc', now()),
  expires_at   timestamptz not null default (timezone('utc', now()) + interval '15 minutes'),
  solved_at    timestamptz,
  constraint human_challenges_purpose_check check (purpose in ('appeal','signup','reset')),
  constraint human_challenges_status_check check (status in ('issued','solved','failed','expired')),
  constraint human_challenges_single_live    unique (email, purpose, status)
);
create index if not exists human_challenges_email_idx on public.human_challenges (email, issued_at desc);

/* ------------------------------------------------------------------ 6. messaging risk -> account risk -- */
/* Bumble's Deception Detector acts before the recipient sees the profile; Freeborn's
   scam guard warns the recipient but the signal died in that request. These columns make
   it durable so it can raise review priority instead of vanishing. */
alter table public.user_trust_history
  add column if not exists scam_flags_7d integer not null default 0,
  add column if not exists scam_flag_last_at timestamptz,
  add column if not exists duplicate_photo_hits integer not null default 0,
  add column if not exists shared_device_accounts integer not null default 0,
  add column if not exists suppression_active boolean not null default false;

/* ------------------------------------------------------------------ 7. RLS + grants -- */
/* Same posture as every other security table in this schema: enabled, zero policies, so
   neither anon nor authenticated can read it through PostgREST; only the service role and
   the postgres owner (bypassrls) touch it, from server code. */
do $$
declare t text;
begin
  foreach t in array array['identity_fingerprints','account_devices','enforcement_cases','human_challenges'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

/* Suppression has to be readable by the discovery path, which runs as service_role, so no
   policy is needed; the boolean on user_trust_history is enough. */
grant select, update on public.user_trust_history to service_role;

/* ------------------------------------------------------------------ 8. helpers -- */
/* Hamming distance between two 64-bit hashes, as a function so the SQL and the tests agree.
   `bit_count` is core Postgres (>=11) — no extension. */
create or replace function public.hamming64(a text, b text)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  with d(s) as (select generate_series(0, 3)),
  dig as (
    select s,
      ((strpos('0123456789abcdef', substr(lower(trim(a)), 1 + 4 * s, 1)) - 1) * 4096
        + (strpos('0123456789abcdef', substr(lower(trim(a)), 2 + 4 * s, 1)) - 1) * 256
        + (strpos('0123456789abcdef', substr(lower(trim(a)), 3 + 4 * s, 1)) - 1) * 16
        + (strpos('0123456789abcdef', substr(lower(trim(a)), 4 + 4 * s, 1)) - 1)) as va,
      ((strpos('0123456789abcdef', substr(lower(trim(b)), 1 + 4 * s, 1)) - 1) * 4096
        + (strpos('0123456789abcdef', substr(lower(trim(b)), 2 + 4 * s, 1)) - 1) * 256
        + (strpos('0123456789abcdef', substr(lower(trim(b)), 3 + 4 * s, 1)) - 1) * 16
        + (strpos('0123456789abcdef', substr(lower(trim(b)), 4 + 4 * s, 1)) - 1)) as vb
      from d
  ),
  x as (select sum(bit_count((((va # vb) # 65536)::bit(16)))) as dist, count(*) as n from dig)
  select case
           when a is null or b is null then null
           when trim(coalesce(a,'')) !~ '^[0-9a-f]{16}$'
             or trim(coalesce(b,'')) !~ '^[0-9a-f]{16}$' then null
           when n <> 4 then null
           else dist::integer
         end
  from x
$$;
comment on function public.hamming64(text, text) is
  'Number of differing bits between two 64-bit hashes. Used for cross-account photo/anchor duplication.';
drop function if exists public.hamming64(bit, bit);
revoke all on function public.hamming64(text, text) from public, anon, authenticated;
grant execute on function public.hamming64(text, text) to service_role;

commit;

/* The nonce/difficulty_bits columns on human_challenges were added after the first
   apply, as a second live migration "freeborn_identity_enforcement_2026_10_28_b"
   (they are needed by /api/human/verify to recompute the prefix without a session). */

/* ============================ APPLIED / VERIFIED ============================
   Applied live on 2026-10-28 as Supabase migration "freeborn_identity_enforcement_2026_10_28"
   against project ihwtpwlszegrjgakqsxx. Post-apply checks are recorded in RE-MECHANICS.md
   section 3 "Live state, read from production" (table existence, RLS/force state, column types, hamming64 parity, backfill counts, probe results).
   ========================================================================== */

/* ============================ v2: LIVE CORRECTIONS (c..g) ============================
   This file was applied live as ..._2026_10_28, then corrected by five further live
   migrations after the real code was executed against the real database:

     c  the six bit(64) hash columns -> char(16) hex (the app emits hex; bit(64) made every
        photo insert fail 22P02 "d" is not a valid binary digit) + phash_bytes char(64) added
        + reports_reason_check re-applied so (c) is self-contained.
     d  hamming64 rewritten to take text. Its own body was still wrong twice over: it cast
        text/bytea to bit (42846 - Postgres cannot) and called popcount() (42883 - does not
        exist on this cluster; PG 17.6 exposes bit_count(bytea) and bit_count(bit) only).
     e  a DIFFERENCE is not a Hamming distance (0x80000000 vs 0x7fffffff differ in 32 bits,
        subtract to 1). Switched to per-half XOR. Also hit 22003: the 64-bit subtraction
        itself overflows bigint.
     f  `% 4294967296` can return 4294967295, which does not fit ::integer -> cast via bigint.
     g  power(16::numeric, k) is APPROXIMATED on this cluster (16^7 -> 268435455.9375,
        16^0 -> 0.0625), so the whole radix-power parse was wrong for every input. Replaced by
        integer-only nibble extraction + bit_count(bit(16)).

   All six are covered by assertions in scripts/trust/harness.ts ([7]) because none of them is
   visible to typecheck, lint or the build. Verified by agreement with a bit-level oracle over
   13 vectors (13/13) and by the write path itself (scripts/trust/live-proof.ts).
   ======================================================================================== */
