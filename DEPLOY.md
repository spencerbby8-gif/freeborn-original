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
(the code has safe fallbacks for Supabase, but set these explicitly)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `SUPABASE_TRANSACTION_POOLER` | your Supabase pooler connection (the app prefers the pooler var) |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | your Supabase publishable/anon key (public by design) |
| `ANTIGRAVITY_BASE_URL` | stage-1 verification engine (required for verification) |
| `ANTIGRAVITY_FREE_API_KEY` | stage-1 verification engine key |
| `VOID_AI_BASE_URL` | stage-2 verification engine (falls back to single-engine without it) |
| `VOID_AI_API_KEY` | stage-2 verification engine key |

## What was cleaned before zipping
- `.env` and `.env.local` (all secrets) — excluded
- `node_modules`, `.next`, `.git`, archives — excluded
- No other file in the project contains those secrets, except the intentional
  fallback constants in `src/db/index.ts` and `src/lib/supabase/*` (same pattern
  the app shipped with). If you ever make the repo PUBLIC, move the pooler
  password out of `src/db/index.ts` into an env var first.
