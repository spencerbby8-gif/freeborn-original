# Reverse-engineering evidence and derived findings — 2026-10-30

What is here, and why nothing else is:

* `MECHANISM-MAP-2026-10-30.md`, `MEDIA-DISAPPEARANCE-2026-10-30.md` — the findings, with every
  claim tagged [C] confirmed / [I] inferred / [?] unknown.
* `SHA256SUMS` — digest of each acquired competitor file, verifiable against the acquisition
  manifest (`analysis-2026-10-29/<app>/_manifest.json`). 37/37 matched on 2026-10-30.
* `MINING-PRECISE.public.json` — the capability mine: counts, files, byte offsets and each
  pattern's `why`. **Quoted source fragments are stripped.** The full version, with short
  excerpts, lives outside this repository in `re/analysis-2026-10-30/rea/`.
* `perfile-index.json` — one entry per REA invocation: exit code, artifact size, record counts.
* `rea-mine2.py`, `rea-extract-modules.py`, `rea-perfile.sh`, `resume-rea.sh` — the tooling that
  produced all of the above, runnable against a re-acquired bundle set.
* `sql/account-delete-fk-coverage.sql` — read-only check that has NOT been run yet. Until it has,
  "account deletion removes all member data" is unproven.

**The bundles themselves are deliberately not committed.** They are other companies' minified
proprietary source; hashes, offsets and counts are enough to audit this analysis and to reproduce
it, and are the form that can live in the product repository. The raw acquisitions stay in the
working directory (`re/analysis-2026-10-29/`, `re/bundles/`), xz-compressed evidence in
`re/analysis-2026-10-30/rea/`.
