# Security notes & credential rotation runbook

Audit date: 2026-10-27. Scope: Supabase `ihwtpwlszegrjgakqsxx`, Vercel project
`freeborn` (`prj_3Y6fEI3YedWsffXGHXWPwesu7BOL`), repo
`spencerbby8-gif/freeborn-original`.

## What changed (F1–F10)

- PostgREST: `profile_with_photos` is `security_invoker=true` and
  service-role-only; `anon` has no table/function grants in `public` and no
  USAGE on `extensions`; all `public` policies are `TO authenticated`;
  `discover_candidates` EXECUTE is service-role-only; `pg_stat_statements` was
  moved to the non-exposed `extensions` schema; `chat-media` is private.
- Auth: redirect allowlist set, password length raised client-side to 12 with a
  HIBP k-anonymity check, CSP uses a nonce instead of `'unsafe-inline'`, session
  cookies are HttpOnly and SameSite=Lax in production.
- Config: `NEXT_PUBLIC_APP_URL`, `FREEBORN_ADMIN_EMAILS`,
  `FREEBORN_ALLOWED_ORIGINS` corrected; Netlify leftovers removed.
- Code health: 4 lint errors fixed, lint gated in CI, dependency overrides for
  2 high and 4 moderate advisories, secret scan added.

## Leaked credentials in public git history (F6)

Historical commit `51d5e62` tracked
`.netlify/functions-internal/___netlify-server-handler/.env` and `.env.local`
with real-looking values. Values are deliberately NOT reproduced here.

Verified liveness on 2026-10-27 (no secret values printed):

| Credential | Status | Action |
|---|---|---|
| Antigravity engine key | **LIVE** — production `/api/health/engines` `engine1.keySha256` matched the historical key's SHA-256 prefix | Rotate at the provider, then update `ANTIGRAVITY_FREE_API_KEY` in Vercel. Requires provider account access — not available to the agent. |
| Netlify PAT | **LIVE** — `GET /api/v1/user` returned HTTP 200 | Revoke at Netlify → User settings → Applications → Personal access tokens. Requires Netlify account access. |
| Supabase pooler/DB password | **DEAD** — the historical URL failed auth with `28P01`; the current Vercel `SUPABASE_TRANSACTION_POOLER` still works (`/api/health/engines` reports `db:true`) | Already rotated by a prior owner action. No further rotation needed; the blob still exists in history. |
| Supabase publishable key | Public by design | No rotation needed. |
| Legacy `service_role` JWT | Present in Supabase API key list; **shared** with the out-of-scope `freeborn-web` Vercel project whose `SUPABASE_URL` is the same project ref | Rotate in Supabase Dashboard → Settings → API (or rotate the JWT secret), then update every consumer including `freeborn-web`. **Blocked:** would break an out-of-scope project; owner decision required. |
| GitHub PAT pasted in chat (old) | Unknown | Revoke at github.com/settings/tokens. Owner action. |
| GitHub PAT supplied for this task | In use | Revoke after verification is complete. Owner action. |

Rotation is the real fix; the repo is public, so a history rewrite alone does
not invalidate a live key. `npm run check:secrets` prevents new leaks in the
current tree. A `git filter-repo` purge of all refs followed by a force-push is
optional and must be coordinated with Vercel (commit SHAs change).

## Residual / owner actions (F9)

The Supabase connector exposes only `site_url`, `uri_allow_list`, `jwt_exp`,
signup toggles and refresh-token settings. It cannot set
`password_min_length`, `password_hibp_enabled`, `security_captcha_enabled` or
enrol MFA for a user. Therefore:

- GoTrue server-side `password_min_length` remains **6**; the UI now enforces
  12 + complexity + HIBP. To enforce server-side, enable
  `password_min_length=12` and `password_hibp_enabled=true` in Supabase
  Dashboard → Authentication → Providers → Email (owner action).
- CAPTCHA remains off: no Cloudflare Turnstile site/secret key was provided.
  The client code already passes `captchaToken` to `signUp`/`signInWithPassword`;
  set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and enable GoTrue Turnstile CAPTCHA with
  the matching secret (owner action).
- MFA for the org owner is not enrolled. Enable TOTP in Supabase Dashboard
  (owner action).
