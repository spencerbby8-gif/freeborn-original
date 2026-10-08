# Freeborn — Netlify deploy guide

## Important: how Netlify deploys Next.js
Netlify **drag-and-drop (Drop) only hosts static folders**. Freeborn is a Next.js
app with server API routes and a database — Drop cannot run it. The guaranteed
no-error path is Netlify's **Git import** (this is also how it was deployed
successfully before):

1. Put this folder in your GitHub repo (a `.gitignore` is included — it keeps
   `.env` / `.env.local` / `node_modules` out automatically).
2. Netlify → **Add new site → Import an existing project → your repo**.
3. Build settings auto-fill from `netlify.toml` (`next build`, publish `.next`).
4. Add the environment variables below in **Site settings → Environment**.
5. Deploy. Netlify installs the Next.js runtime automatically — no local
   Netlify packages are needed.

## Environment variables to set in Netlify

### Required

| Variable | Purpose |
|---|---|
| `SUPABASE_TRANSACTION_POOLER` *(preferred)* or `DATABASE_URL` | your Supabase **transaction pooler** connection string. Needed at runtime for every database query — profiles, discovery, matches, messages, likes. Get it from Supabase → Project Settings → Database → Connection string → **Transaction pooler**. |
| `SUPABASE_URL` | your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | your Supabase publishable/anon key (public by design) |

### Optional

| Variable | Purpose |
|---|---|
| `ANTIGRAVITY_BASE_URL` | stage-1 verification engine (required for verification) |
| `ANTIGRAVITY_FREE_API_KEY` | stage-1 verification engine key |
| `VOID_AI_BASE_URL` | stage-2 verification engine (falls back to single-engine without it) |
| `VOID_AI_API_KEY` | stage-2 verification engine key |

> **`SUPABASE_URL` is not a substitute for `SUPABASE_TRANSACTION_POOLER`.**
> They are two different things. `SUPABASE_URL` is the HTTPS API endpoint the
> Supabase JS client uses for auth/storage/realtime. `SUPABASE_TRANSACTION_POOLER`
> is the raw Postgres connection string that Drizzle ORM uses for SQL queries.
> Setting one does not provide the other — the app needs **both**.

> **Build vs runtime:** `next build` does **not** need a database. The connection
> is created lazily on the first query, so the build succeeds even with no
> database variable set. You only need the pooler string for the app to serve
> real traffic. If it is missing at runtime you will get
> *"No database connection configured..."* on the first request that queries.

## What was cleaned before zipping
- `.env` and `.env.local` (all secrets) — excluded
- `node_modules`, `.next`, `.git`, archives — excluded

## Security notes
- The hardcoded pooler password that used to live in `src/db/index.ts` has been
  removed (this repository is public). The connection string is now read only
  from `SUPABASE_TRANSACTION_POOLER` / `DATABASE_URL`.
- The Supabase **publishable/anon** key in `src/lib/supabase/*` is intentionally
  committed — it is public by design and safe to ship to the browser.
- Test-account passwords in `scripts/*.mjs` are read from the `E2E_PASSWORD`
  environment variable rather than hardcoded.
- The `postgres:postgres@127.0.0.1:5432/app_db` string in `drizzle.config.json`
  is the stock local Docker Postgres default, used as a sentinel to detect an
  unconfigured sandbox — not a credential.
