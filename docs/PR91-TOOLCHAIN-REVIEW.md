# PR #91: compatible development-toolchain repair

## Confirmed original failures

Original Dependabot head: `b6d855275afa0e08d70df4fd2bcf5cb4138017ff`.

- Vercel deployment `dpl_9pbSrUJNGcYEaSTtxdanJKDtJFCh` compiled, then failed typechecking with `TS5102: Option 'baseUrl' has been removed`.
- GitHub verify job `137522442516`, run `45123500504`, failed at Typecheck.
- Local original-PR typecheck reproduced that error with TypeScript **7.0.2** (not TypeScript 6).
- Local original-PR lint also crashes: `typescript-eslint does not support TS 7.0`.
- After restoring the direct compiler/linter versions, the newly resolved react-hooks 7.1.1 lint dependency reported 20 additional errors in the old base's source. These are retained in the external audit, not hidden by disabling rules.

## Bounded repair

Keep seven of the ten grouped direct development updates. Defer TypeScript 7, ESLint 10, and eslint-config-next 16.4.6 until a dedicated migration can reconcile their compiler/API/rule changes. Restore the working TypeScript 5.9.3, ESLint 9.39.4, eslint-config-next 16.2.6 versions, and explicitly override eslint-plugin-react-hooks to the pre-batch 7.0.1 version. No lint rule or CI gate is disabled. Regenerate package-lock.json.

This intentionally narrows the dependency update rather than pretending that deleting `baseUrl` alone makes TypeScript 7 compatible with the ESLint parser. The native newer compiler and broader hooks-rule migration remain deferred technical work.

## Local results

- Typecheck passes.
- Lint passes with the compatible direct versions and the explicit hooks override.
- Next.js production build passes (fixture public Supabase configuration; no hosted member validation).
- Trust harness: 624/624.
- Runtime dependency audit: zero vulnerabilities.

These are local results, not hosted GitHub/Vercel/Netlify checks. Netlify's original individual check logs were not fetched; their exact failure causes are not claimed. Push and hosted-check outcomes must be verified against the exact latest PR #91 head SHA and delivery receipt. This local review does not certify a merge or production deployment.
