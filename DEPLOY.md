# Freeborn — Vercel deploy guide

The production app is **Next.js 16 (App Router) on Vercel**, git-linked to
`spencerbby8-gif/freeborn-original`, production branch `main`, prod domain
`freeborn-umber.vercel.app`. (A legacy `netlify.toml` from an earlier hosting era
was removed 2026-10-27; nothing in the running product uses Netlify.)

## How deploys work

1. **Push to `main` → production deploy** (~25 s builds, Turbopack).
2. **Push to any branch → preview deploy**, auto-linked to the branch alias
   (`freeborn-git-<branch>-….vercel.app`). Use previews to verify before merging.
3. **Rollback**: Vercel → Deployments → ⋯ → *Instant Rollback* on the previous
   READY deploy. Recent production deploys are retained for 30 days (last 10 kept).

## Environment variables (Vercel → Settings → Environment Variables)

| Variable | Purpose | Scope |
|---|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | all |
| `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable anon key (RLS is the guard) | all |
| `SUPABASE_TRANSACTION_POOLER` | PG pooler conn string (server-only secret) | production |
| `NEXT_PUBLIC_APP_URL` | canonical origin, used in cookies/links | all |
| `ANTIGRAVITY_BASE_URL` + `ANTIGRAVITY_FREE_API_KEY` | verification/moderation engine 1 | production, sensitive |
| `VOID_AI_BASE_URL` + `VOID_AI_API_KEY` | engine 2 (optional) | production, sensitive |
| `FREEBORN_ADMIN_EMAILS` | operator allowlist for `/api/health/engines` (F1) | all |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (+`TURNSTILE_SECRET_KEY` when the trust layer ships) | visitor challenge widget | all |
| `FREEBORN_TURN_URL/USER/CRED` | WebRTC relay for calls — **not currently set**; calls degrade to host/srflx candidates. Documented degrade, see `src/app/api/calls/ice/route.ts` | production |

Full descriptions live in `.env.example`. Nothing secret in a `NEXT_PUBLIC_*`
var, ever.

## Operational truths worth knowing (verified 2026-10-27)

- **Health probes**: `/api/health` → `{ok:true}` (public, minimal).
  `/api/health/engines` → operator-only; anonymous or non-allowlisted requests
  receive a bare 404 by design (audit F1). Ask yourself to be allowlisted via
  `FREEBORN_ADMIN_EMAILS` before debugging engines.
- **CORS posture**: API routes do not emit `access-control-allow-origin`
  (verified against a hostile `Origin` on 2026-10-27). The static landing page
  is served from Vercel's cache with `access-control-allow-origin: *` — it is
  public marketing HTML with no credentials; that is expected edge behavior,
  not a misconfiguration.
- **Database changes**: applied via Supabase (SQL/migrations API or dashboard)
  as the project owner, then RECORDED as idempotent files under `db/migrations/`
  (pattern since 2026-10-11 — see `2026-10-16-rls-and-media-ownership.sql`).
  The repo is not the schema's source of truth; the DB is. See the drift note
  in the audit report (F4).
- **Public repo rule**: `sb_publishable_*` fallback constants in
  `src/lib/supabase/*.ts` are publishable by design. Verified 2026-10-27 sweep:
  no pooler passwords, no service-role JWTs anywhere in git (old DEPLOY.md
  claimed otherwise — that was stale prose, now corrected).

## If the app must move hosts
Next.js App Router with Node lambdas; any platform with a Next runtime works
(Netlify, Fly, Docker). Recreate the env table above, set NODE 24, run `next build`.
