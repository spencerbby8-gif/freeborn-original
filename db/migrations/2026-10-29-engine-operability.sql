-- Engine operability: two live production defects and one new challenge purpose.
-- Applied to the live database on 2026-10-29 via the Supabase connector. Idempotent.

-- 1. reports_reason_check: production enumerated 12 legacy values and was MISSING 'safety',
--    so `POST /api/reports` with reason="safety" raised 23514 and the report was lost
--    (reproduced: insert ... values ('safety') -> ERROR: 23514). The app-side set is 8
--    values; the union keeps every value existing rows already carry, so this constraint can
--    never be re-narrowed under data and re-applied later.
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check check (
  reason in (
    'fake_profile','scam','harassment','safety','underage',
    'inappropriate_media','ai_generated_media','other',
    'inappropriate_content','spam','nudity','violence','selfie_mismatch'
  )
);

-- 2. human_challenges purpose gains 'verification': the selfie path needs a server-issued,
--    single-use, expiring challenge so a liveness claim is attributable rather than asserted.
alter table public.human_challenges drop constraint if exists human_challenges_purpose_check;
alter table public.human_challenges add constraint human_challenges_purpose_check check (
  purpose in ('appeal','signup','reset','verification')
);

-- 3. Triage visibility. `triage='pending'` is computed in the route and never stored, so an
--    operator reading the queue cannot tell "both engines are down" (today's steady state:
--    ANTIGRAVITY_*/VOID_AI_* exist but are empty) from "not processed yet".
alter table public.reports add column if not exists triage text
  check (triage in ('complete','pending'));
comment on column public.reports.triage is
  'complete = both engines returned a verdict; pending = engine unavailable or over budget, the row is unjudged and needs a human. Nullable on rows predating this column.';

-- Verification (run after applying; each must return exactly one row):
--   select conname from pg_constraint where conrelid='public.reports'::regclass
--     and conname in ('reports_reason_check','reports_triage_check') order by 1;
--   select pg_get_constraintdef(oid) from pg_constraint
--     where conname='human_challenges_purpose_check';
--   insert into public.reports (reason, details, origin) values ('safety','probe','member')
--     returning id;  /* must now SUCCEED, then delete the probe row */
