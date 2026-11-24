# Discovery auth and onboarding regression review

## Delivery boundary

This is a source/local-validation change. It has not been merged, promoted to production, or validated with a real hosted signup. Opening a GitHub PR and updating Dependabot PR #91 require authenticated GitHub access. A compare URL is not a created PR.

## Diagnosis

The browser member requester already sends a Bearer token. The installed Supabase client supports `getUser()` with the existing custom Authorization header; absence of an SSR cookie is not by itself the root cause.

A read-only aggregate of the actual Supabase project found one auth-user/account-mirror email-to-ID mismatch, six missing account mirrors, and no missing profile rows or profile email-to-ID mismatches. No emails, member IDs, session tokens, or account records were exported. A local PostgreSQL negative control reproduces the exact failure mechanism: `ON CONFLICT (id) DO NOTHING` still raises a unique-email violation when a recreated auth identity reuses an email held by another mirror UUID.

Both discovery and profile-detail routes previously caught every `getMember()` exception and returned 401. The discovery UI also rendered its exhausted-deck state alongside the error. This combination explains the observed misleading presentation, but the affected member's hosted session has not been replayed.

## Changes

- Ignore account-mirror uniqueness conflicts without updating, transferring, deleting, or authenticating as the legacy mirror ID. The authenticated Supabase UUID remains authoritative. Profile insertions retain their ID-targeted conflict protection; unexpected profile conflicts still fail closed.
- Apply the mirror conflict policy consistently in onboarding/photo helper writes. This is not a migration or reconciliation of legacy account mirrors. A conflicting legacy mirror may still require separate investigation for account-table-backed features; no legacy verification records are transferred.
- Return a generic 503 for member-resolution exceptions on discovery/profile detail, keeping 401 for a genuinely missing authenticated member. Provider server-error/rate-limit responses are treated as outages rather than missing sessions. Internal database/provider messages are not returned.
- Suppress the empty deck and reset actions on a failed discovery resource; preserve the genuinely successful empty-deck state and retry recovery.
- Replace About-step datalists with explicit native selectors: 69 occupations, 11 education choices, 59 languages, 29 faith/belief choices. Preserve optional not-shared and custom-answer paths. Identity/date/gender remain explicit native selectors; intentions/values/lifestyle/interests remain visible option/chip controls, with existing expansion where needed (9 gender, 5 intention, 43 value, 67 lifestyle, 80 interest choices). Location remains free-text/GPS rather than pretending a finite city list is comprehensive. Photo controls remain upload/camera actions.
- Reset actual ancestor scrollports after each step commits, and focus the new heading without scrolling. No artificial height/padding or added onboarding screens.
- Explicitly size and center the email-code submit button across the form.
- Add local PostgreSQL regression coverage to CI, browser regression script, and profile-route error-status checks.

## Evidence

- Local PostgreSQL member-auth regression: 8/8, including an old-code negative control producing SQLSTATE 23505. Uses temporary tables based on the declared column types/UUID/email uniqueness and a substituted Supabase auth adapter; rolled back afterwards. Not hosted auth/RLS acceptance.
- Discovery/filter/privacy handler contracts: 34/34, including 503-versus-401 coverage for both affected routes.
- Browser regression: 12/12 at 393×852 and 1440×1000; 16 screenshots, zero page errors. Exercises all forward step transitions plus Back, selections/custom saves, 401/503 versus true empty, retry recovery, own-profile bearer preview, OTP invalid/valid behavior, and exact button-width/centering measurements.
- Browser auth/API responses are intercepted fixture services in an isolated build. The UI suite refuses a build without the fixture Supabase URL. No real inbox, signup, production API success, physical-device or RLS claim.
- Typecheck, lint, production build, secret scan, environment-isolation and migration-integrity checks pass locally.
- Trust harness 624/624; prototype API contracts 28/28; media, filter-storage and discovery-presentation contracts also pass locally.

The audit workspace retains initial invalid test attempts and memory-limited build failures separately from final successful evidence. The first UI failure was a test locator using `.discovery-card` rather than the existing `.profile-card`; it was corrected without changing the app or dropping the recovery assertion.

## Reproduce

```sh
npm run typecheck
npm run lint
npm run build
FREEBORN_AUTH_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db npm run test:member-auth
npm run test:discovery-privacy
```

For browser checks, build a **separate checkout** with `NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co` and a fixture-only publishable key, start it on port 3003, then run `FREEBORN_UI_BASE_URL=http://127.0.0.1:3003 npm run test:auth-onboarding`. Do not use fixture credentials against a real provider build or bypass application authentication.

## Still required

1. Authenticated feature-branch push and creation of the actual review PR.
2. Review/deploy preview, then a consenting member's real email-code signup, onboarding, discovery, own-profile preview and refresh/re-entry verification. Inspect privacy-preserving server errors if failures remain.
3. Separate PR #91 repair delivery and hosted check reruns; its dependency fix is kept outside this product branch.
4. Any merge or production promotion needs approval.
5. SEO indexing/ranking/signup evidence remains outstanding; none of these fixes proves SEO outcomes.
