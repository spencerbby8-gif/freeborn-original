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

Node **24.22.1** is the pinned development, CI, and Vercel runtime. Use the
Supabase project CA for every remote database connection; unverified Supabase
TLS is rejected in every environment.

## Checks

```bash
npm run check:secrets
npm run check:env
npm run check:migrations
npm run typecheck
npm run lint
npm run test:harness
npm run test:engines
npm run test:db-tls
npm run test:deletion-local
npm run test:retention-local
npm run test:retention-worker
npm run test:pose
npm run test:pose:negctl
npm audit --audit-level=moderate
npm run build
```

These gates are wired into CI. `npm run check:secrets` scans the tracked tree
for credential-shaped strings. Historical Netlify build-artifact `.env` blobs
from 2026-10-27 and earlier are outside the current tree — see `SECURITY.md`.

## Architecture and isolation

- `src/db/index.ts` connects through `SUPABASE_TRANSACTION_POOLER`. Remote
  Supabase connections require `DATABASE_CA_CERT`; DSN TLS parameters cannot
  override the explicit verified-TLS policy.
- The reviewed Preview uses a separate Supabase project and the purpose-built
  `freeborn_runtime` role: no `BYPASSRLS`, no Auth/Storage schema grants, no
  retention-worker grants, and only the table/function grants required by API
  routes. RLS remains enabled and forced. PostgREST member access is separately
  constrained by member JWT claims and RLS policies.
- Production and Preview must never share database credentials, member data,
  Auth-admin keys, engine keys, operator keys, TURN credentials, or worker
  secrets. Canonical Production variables stay Production-only.
- `src/lib/site.ts` is the canonical application origin;
  `NEXT_PUBLIC_APP_URL` and `FREEBORN_ALLOWED_ORIGINS` must match the intended
  deployment.
- `src/middleware.ts` issues a per-request CSP nonce.

## Migration and deployment provenance

The 11 recovered historical migrations are restored byte-for-byte, and all
current migration inputs are hash-checked. `supabase/clean-start/manifest.json`
defines a 43-step clean non-production replay with explicit application-derived
compatibility inputs. It excludes both scheduling migrations; FB-15 stays
paused.

```bash
npm run check:migrations
```

See `supabase/clean-start/README.md` for the guarded destructive test replay.
Never use clean replay, `drizzle-kit push`, or `supabase db push` as a Production
repair. Production requires separately approved append-only forward migrations,
credential coordination, and deployment approval; the exact prepared boundary
is in `docs/PRODUCTION-REMEDIATION-GATE.md`.

Deploy guide: `DEPLOY.md`. Credential rotation runbook: `SECURITY.md`.
