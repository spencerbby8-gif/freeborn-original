# Freeborn

Values-aligned dating platform (Next.js 16 App Router + Supabase). Production:
**https://freeborn-umber.vercel.app**, git-linked to
`spencerbby8-gif/freeborn-original`, branch `main`.

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in real values; never commit .env.local
npm run dev
```

Node 24 is used on Vercel; Node >=20.9 works locally (the Supabase JS SDK
emits an EBADENGINE warning below Node 22, which is harmless for development).

## Checks (all run in CI)

```bash
npm run typecheck
npm run lint
npm run check:secrets
npm run build
```

`npm run check:secrets` scans the tracked tree for credential-shaped strings.
Historical Netlify build-artifact `.env` blobs from 2026-10-27 and earlier are
**not** covered — see `SECURITY.md`.

## Architecture notes

- `src/db/index.ts` connects to Supabase Postgres through
  `SUPABASE_TRANSACTION_POOLER` (server-only). API routes use Drizzle as the DB
  owner and therefore bypass RLS; PostgREST is used only for the signed-in
  member's own rows. Anonymous PostgREST access to `public` was removed in the
  2026-10-27 audit (see `db/migrations/2026-10-27-audit-f1-f10.sql`).
- `src/lib/site.ts` is the single canonical origin. `NEXT_PUBLIC_APP_URL` must
  match it.
- `src/middleware.ts` issues a per-request CSP nonce; all pages render
  dynamically so the nonce reaches prerendered marketing/legal routes.
- Deploy guide: `DEPLOY.md`. Credential rotation runbook: `SECURITY.md`.
