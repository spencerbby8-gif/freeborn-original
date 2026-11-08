# Guarded clean non-production replay

This directory makes the reviewed application schema reproducible from an empty Supabase test project without rewriting any applied migration.

## What is fixed

- The 11 historical migrations recovered from `spencerbby8-gif/FREEBORN` commit `79820bc5a99763213b7c361754a5e602fa83ecc9` are restored byte-for-byte under `supabase/migrations/`.
- The existing `db/migrations/` and `supabase/migrations/` files from reviewed commit `ad3d9d16ab5f9a083343ccf5a6ad4cd890404d83` are hash-checked by CI.
- `manifest.json` records the exact 43-step clean-start order and SHA-256 of every input. Application-derived compatibility statements are explicit inputs, not misrepresented as recovered Production SQL.
- FB-14 and FB-15 scheduling files are deliberately excluded. In particular, clean Preview replay never activates FB-15.
- The final replay step verifies 42 public tables, 435 columns, 122 indexes, 74 check constraints, enabled+forced RLS, zero anonymous table grants, only policy-backed authenticated table privileges, storage bounds, and paused FB-15 scheduling.
- The final application steps remove only authenticated privileges that no member RLS policy can authorize, reconcile private bucket size/MIME bounds, revoke residual anon/member sequence privileges, and drop two historical audit probe functions. They add no grants and do not change runtime/service-role access, policies, member data, or scheduling.

This proves clean Preview reproducibility. It does **not** prove Production migration provenance or authorize a Production deployment.

## Static validation

```bash
npm run check:migrations
```

## Destructive test-project replay

Use only a disposable Supabase project with zero Auth users and zero Storage objects. Use the disposable project's own `postgres` owner login. Supabase does not permit creating or delegating a new superuser/postgres role through the management SQL role. Rotate only the disposable project password through an authorized management channel. Do not print or persist its DSN in the repository, logs, reports, or evidence.

Required protected environment:

- `SUPABASE_TRANSACTION_POOLER`: DSN with username `postgres.<PROJECT_REF>` on the test project's pooler.
- `DATABASE_CA_FILE`: path to the official Supabase CA, or `DATABASE_CA_CERT` containing the public PEM.
- `FREEBORN_REPLAY_PROJECT_REF`: exact 20-character test project ref.
- `FREEBORN_CLEAN_REPLAY_ACK`: exactly `RESET_NONPRODUCTION_<PROJECT_REF>`.

Then run:

```bash
npm run db:clean-replay -- --reset
```

The runner:

1. refuses the known Production project ref;
2. requires the exact scoped project-owner login and verified TLS;
3. refuses to proceed if Auth users or Storage objects exist;
4. verifies every input hash before resetting anything;
5. drops and recreates only the application `public` schema and test bucket metadata;
6. executes the 43 manifest steps and records each successful step;
7. fails unless the complete catalog and security contract matches.

The existing `freeborn_runtime` role is recreated with least-privilege grants but no password. On a new project, assign its password through an approved secret channel. Never copy a Production credential into Preview.

## Production boundary

Do not run this runner against Production. Do not use `supabase db push`, `drizzle-kit push`, or a clean-start reset as a Production repair. Production requires a separately reviewed, append-only forward migration and a fresh credential/configuration plan based on authorized live evidence. See `docs/PRODUCTION-REMEDIATION-GATE.md`.
