# REA evidence and implementation-mapping gap report

Written 2026-10-29 against commit `cff26a0` (`= origin/main`, deployed as `dpl_FatxAjugrRprxGZCtiqQ6iuG2xQu`).
Scope of this document: **proof of what REA actually did**, separation of recovered fact from inference,
and an honest engine status table. No product code was changed to produce it.

The headline, stated before anything flattering:

> **REA was genuinely run — but only against Tinder.** For Bumble and Hinge, my findings came from my own
> scripted fetch + string/regex/AST-adjacent analysis of their public web bundles, **not** from REA. I tried
> to change that today; both REA runs failed under the sandbox's memory ceiling, and I report that as a
> failure rather than quietly describing my grep as REA's output.

---

## 1. Exact REA commands

All runs used REA 6.8.0 from the upstream `rea-agents` npm package (not any mirror), on a self-supplied
Node v24.22.1, inside `/home/user/re`.

**Original run 1 — full Tinder bundle set** (recorded in `re/rea-tinder.log`, 10,149,418 B / 224,414 lines):

```bash
export PATH=/home/user/re/node24/bin:$PATH
rea analyze-javascript-application /home/user/re/app/tinder > /home/user/re/rea-tinder.log 2>&1
```

Parameters as **recorded by REA itself** in its evidence output (`records[0].parameters`):

```json
{"analysis_timeout_ms": 300000, "format": "auto",
 "input_path": "/home/user/re/app/tinder",
 "integrity_policy": "fail"}
```

Scope actually parsed, from the progress frames (5 files):
`79047-fd15ebba71088abd6652.js`, `main-dc2addb81fed3c105970.js`,
`pc-webpack-runtime-338625c720b811f8f1e6.js`, `tinderapp-cfb387acc7e482a3547b.js`,
`vendor-5a05cf0d48eac6631043.js`.

**Original run 2 — narrowed to the main bundle** (recorded in `re/rea-tinder2.log`, 16,153 B, and the
surviving evidence bundle `re/rea-tinder-main.json`, 1,056,129 B):

```bash
rea analyze-javascript-application /home/user/re/app/tinder \
  --source-path main-dc2addb81fed3c105970.js \
  --analysis-timeout-ms 1200000 --integrity-policy fail \
  --detail summary --evidence_output /home/user/re/rea-tinder-main.json
```

Recorded parameters: `{"analysis_timeout_ms":1200000,"input_path":"/home/user/re/app/tinder",
"integrity_policy":"fail","source_paths":["main-dc2addb81fed3c105970.js"]}`.

**How the artifacts were obtained** (my scripts, not REA — REA analysed a local directory it was handed):
`re/grab.mjs` and `re/grab2.mjs` parse the saved public HTML shells in `re/bundles/*.index.html`, expand
Next.js `_buildManifest.js`, and fetch same-origin public `.js` assets with a browser UA, skipping anything
over 25 MB. No APK was fetched, unpacked or decompiled; no authenticated scraping; no bypass of any
captcha/MFA/anti-bot control.

**Tool availability, re-verified today rather than quoted:** `rea doctor` still classifies `hopper`,
`ghidra`, `ida-registration` and `jadx` as `missing_analysis_engine` in this sandbox. So there was never a
native/binary decompilation path here, only JavaScript static analysis.

### Commands run TODAY for this report (the Bumble/Hinge gap, and its outcome)

```bash
# artifacts re-fetched from the live public sites into /tmp/recheck/app3/{bumble,hinge}
rea analyze-javascript-application /tmp/recheck/app3/bumble --detail summary \
  --evidence_output /tmp/recheck/out/rea-bumble.json --analysis-timeout-ms 300000 --integrity-policy fail
#   -> exit 137, process Killed (OOM). 12 chunks, incl. a 1.60 MB one, too large for this sandbox.

rea analyze-javascript-application /tmp/recheck/app3/hinge --detail summary \
  --evidence_output /tmp/recheck/out/rea-hinge.json --analysis-timeout-ms 300000 --integrity-policy fail
#   -> exit 137, Killed at file 6/23.

rea analyze-javascript-application /tmp/recheck/app3/bumble \
  --source-path 7baa63ca4f39942f.js --detail summary \
  --evidence_output /tmp/recheck/out/rea-bumble.json \
  --max-semantic-nodes 20000 --max-semantic-nodes-per-file 8000 --max-semantic-unknowns 20000 \
  --max-heap-mb 768 --analysis-timeout-ms 240000 --integrity-policy fail
#   -> exit 0, 278 KB of progress + summary, "Processing 1 selected application files",
#      coverage "complete" on the file node, REA's own limitation notes attached.
#      BUT: --evidence_output produced NO file anywhere on disk, and the summary text contains
#      0 endpoint paths, 0 storage facts, 0 `device_id` references.
#      => REA ran and completed structurally; `--detail summary` without a written bundle carries
#         no extractable findings. This is a real limitation of my method, not a result.
```

Corollary worth keeping: REA has an **`analyze-web-bundle`** command ("capture and statically analyze a
page bundle, defaulting to the selected target origin") which I never used. Using it would have removed my
hand-rolled `grab.mjs` step and its fragility. That is a method gap, listed in §6.

---

## 2. Artifacts analyzed, with digests

The `re/app/{tinder,bumble,hinge}` directories **did not survive the sandbox snapshot** (the same rollback
that also cost git history). What survives is REA's own record *of* them, plus what I re-fetched today.

| App | Artifact | Size | Digest | Provenance |
|---|---|---|---|---|
| Tinder | `main-dc2addb81fed3c105970.js` | (REA-recorded) | dir `sha256:88d136fd…003e5`, asset `e741f62c…` | REA `subject.digest` + evidence `artifact.sha256`, `authority: artifact-bytes`, `confidence: exact` |
| Tinder | 4 further chunks (run 1) | — | named in progress frames | REA run-1 log |
| Bumble | 12 public chunks, 2.39 MB | 1,596,261 B largest | `7baa63ca…` = `ceb959d1bc651a60…`, `973dca4d…` = `504e7fea970929b8…` | fetched today; REA's own run reports the same digests |
| Hinge | 23 public chunks, 2.14 MB | 130,536 B largest | e.g. `441-8a8a64a04d71c32a.js` | fetched today |
| All three | public HTML shells | 186 KB / 95 KB / 575 KB | `re/bundles/*.index.html` | captured earlier, survived |

**Rotated-hash caveat, verified not assumed:** the live Tinder shell now serves
`main-7e53e9bca261f01e6173.js`; `main-dc2addb81fed3c105970` no longer appears in it (`grep -c` → 0).
So REA's recorded subject file is stale by design — client bundles are redeployed. My re-verification
therefore runs against *today's* bytes, which is stronger evidence than re-reading a frozen copy.

---

## 3. Recovered behaviour, and its actual instrument

Every row below was re-checked against bytes fetched **during this report**, in `/tmp/recheck/app2|app3`.
"Via REA" means the string is present in REA's persisted evidence bundle; "direct" means I found it by
scripted parsing and it is **not** in REA's output.

### Tinder — against today's live bundle

| Claim | Occurrences in live bytes | Instrument |
|---|---|---|
| `likelyAgent` server verdict, verbatim `const N=(e,t,a)=>a().then((a=>{a?.likelyAgent&&(e=>{try{const t=e();return(0,I.rV)(t)&&!(0,I.lb)(t)}catch{return!1}})(t)&&((0,C.p)(),e((0,y.ri)(!1)))}))` | 1 | **direct**; module resolution (`I=a(33132)`, `.rV`/`.lb`/`.ri`) confirmed verbatim in the same expression |
| `X-Agent-Signals` header | 1 | direct |
| `persistent-device-id` | 1 | direct |
| `appealChallengeToken` / `SET_APPEALABLE_BAN_CHALLENGE_TOKEN` | 4 / 4 | direct |
| `initClientFingerprint` | 1 | direct |
| `/v2/auth/verify-captcha` | 1 | direct |
| Enforcement taxonomy, contiguous constant block `m="ACTIVE",A="INACTIVE",g="CONTENT_REMOVED",f="WARNING",y="BAN",I="SUPPRESSION",C="SUSPENSION",N="ban"` + `warning/account/suppression/suspension`, `inReview/complete` | 1 block | direct |
| `WARNING_REMOVED`, `CONTENT_REINSTATED`, `VIOLATING_BEHAVIOR` | 1 each | direct |
| `/v4/report/tree`, `recDislike`, `app-session-time-elapsed` | 1 each | direct |
| **142 endpoint literals, 23 security-relevant** incl. `/v1/appeals`, `/v1/appeals/cases`, `/v1/banned-user/appeals`, `/v1/identity-verification/{sdk/init,idv/challenge,idv/challenge-status,selfie/challenges,selfie/verifications,selfie/id-verify}`, `/v2/verification/facemap/{info,photo-match,id-verify}`, `/v2/verification/selfie/{start,complete}`, `/v2/tinderu/verify`, `/v2/block/profile/direct`, `/v4/report/new`, `/v3/report/{primaryId}/{secondaryId}/{offenderId}` | — | **via REA** — these are inside `re/rea-tinder-main.json`'s graph with byte-level evidence |

### Bumble — 12 chunks, 2.39 MB

| Claim | Live bytes | Instrument |
|---|---|---|
| telemetry carries `device_id` | `device_id` ×3, `DEVICE_ID` ×2 | direct |
| error telemetry `/jss/js_error.phtml` with token `bumble_rebrand` | ×1 / ×1 | direct |
| `navigator.language` on events; `AFFILIATE="aff"` / `INVITE="inv"` cookie keys; `beacon` | ×5 / ×1 / ×2 | direct |
| **negative result:** no FaceTec / Arkose runtime code | absent (0 / 0) | direct |
| `persona` = 402 hits that are i18n/copy keys, **not** the Veriff/Persona vendor | `persona` ×402, `verif` ×59 | direct (count drifted 423 → 402 between captures — a redeploy, not a contradiction) |

### Hinge — 23 chunks, 2.14 MB

| Claim | Live bytes | Instrument |
|---|---|---|
| only security-ish strings are Sentry internals: `_fingerprint` ×6, `setFingerprint` ×1, `X-Sentry-Rate-Limits` ×1 | present | direct |
| web-vitals inputs `deviceMemory` ×3, `hardwareConcurrency` ×3, `maxTouchPoints` ×1, `userAgent` ×23 | present | direct |
| **negative result:** no `liveness`, no `selfie`, no FaceTec, no Arkose | all ×0 | direct |
| the 2 `persona` hits are `personalProfileBlock` / `pressLinksBlock` content-block keys — attribution checked, vendor claim rejected | shown verbatim | direct |
| `hinge.co` and `app.hinge.co` serve the same 95,950-byte marketing page | reproduced: `hinge.index.html` is 95,950 B | direct |

### Inference (never observed in a client; kept separate deliberately)

- Dwell-time/cadence intent behind the `*-session-time-elapsed` header **pairs** — inferred from names.
- "deck = `recs/core` with fast-match as a bounded sub-deck" — inferred.
- "verification acts through *filters*, not a hidden rank score" — inferred, and separately corroborated by a
  named operator statement below.
- "Hinge has no web client, which is itself an anti-abuse posture" — the no-web-client part is recovered;
  the *because it reduces scriptable surface* motive is my inference.

### Verified-external (operator/vendor statements, named, accessed 2026-10-28 — not client evidence)

Tinder Face Check (PR Newswire + Wired 2025-10-22, Axios 2025-06-30, biometricupdate 2025-10-23); ~60% /
>40% / +10% effect claims (**vendor-reported, not independently measured**); 169 new + 108 improved automated
rules (congressional report via NBC News 2026-10-14); verification-as-filter (TechCrunch 2023-04-27);
FaceTec 1/125M FAR and Level-4 spoof blocks (facetec.com/security — vendor); Hinge Face Check with facial age
estimation and "age estimate + three audit images kept, may train select ML models" (biometricupdate
2026-02-05, swipestats 2026-05-26); Bumble Deception Detector 95%/45% figures and AI-generated-media report
reason (Mashable 2024-02-09, Engadget 2024-07-09). **None of these are REA output and none are claimed as
recovered from a client.**

---

## 4. Finding → implemented code

| # | Recovered/verified mechanic | Freeborn implementation | Route wiring (measured) |
|---|---|---|---|
| 1 | Face-vector index + cross-account duplicate check | `src/lib/photo-hash.ts` `deriveAnchor` → opaque non-biometric anchor; `identity-resolve.ts` `findSharedAnchor` | `/api/verification/check`, `/api/profile/photos`, + 7 more |
| 2 | Perceptual hash of every photo, matched cross-account | `photo-hash.ts` dHash/aHash; `char(16)` `phash_d`, `phash_bytes` in `src/db/schema.ts`; `_g hamming64` SQL | `/api/profile/photos`, `/api/verification/check` |
| 3 | Persistent device identity, server-side | `device/self` route + device linkage in `identity-resolve.ts`; **deliberately a hashed install-id, not a canvas fingerprint** | `/api/device/self` |
| 4 | Graduated warning → **suppression** → suspension → ban | `src/lib/moderation-policy.ts` `decidePolicy`; `enforcement_cases` + `one_live_per_tier` index | `/api/safety/cases`, `/api/safety/cases/ack`, `/api/profiles` deck exclusion |
| 5 | Warning acknowledgement as a member action | `/api/safety/cases/ack` (owner-only; cross-member returns `not-found`) | live, 401 anon, verified in prod SQL |
| 6 | Human challenge gating an appeal | `human_challenges` + `/api/human/issue` + `/api/human/verify` (PoW, 18-bit default, ceiling 20) | `/api/appeals` consumes the token; `FREEBORN_HUMAN_CHALLENGE` default = `record`, **not** `enforce` |
| 7 | Trust score actually computed and used | `src/lib/trust-score.ts` — 13 weighted, capped signals (`verified` +12 … `automatedTrafficBlocks7d` −8/cap −24, `openSuppressions` −10), clamped 0..100 | `/api/trust/self`; recomputed by `identity-resolve.ts` |
| 8 | Verification as a *filter* on deck/messaging | `identity-resolve.ts` + `/api/profiles` exclusion; no hidden rank penalty | `/api/profiles`, `/api/chat/messages` |
| 9 | Versioned report taxonomy incl. AI-generated media | `reports_reason_check` extended to 12 values w/ `ai_generated_media` | `/api/reports` |
| 10 | Dwell-time / cadence, review-priority only | counters in `identity-resolve.ts`; never auto-action | shared |

The schema previously had `trust_score` / `duplicate_detection_risk` columns **that no code wrote** (§5 row 7
was the highest-value gap) — `trust-score.ts` + `recomputeTrust` close it. This is the only item I can describe
as "a real hole that was actually filled", rather than a feature added on top.

---

## 5. Engine status: implemented vs production-tested vs still incomplete

Config evidence, read from Vercel production this turn: `ANTIGRAVITY_BASE_URL`, `ANTIGRAVITY_FREE_API_KEY`,
`VOID_AI_BASE_URL`, `VOID_AI_API_KEY` **exist as vars but with empty values** (`type: sensitive`,
`visibility: secret`, `value: ""`) targeting production. `LM7_API_KEY` / `LM7_BASE_URL`, `FREEBORN_HUMAN_CHALLENGE`
and `FREEBORN_TURN_*` are **not defined at all**. `FREEBORN_ADMIN_EMAILS` is defined and empty.

| Engine | Implemented | Production-tested | Incomplete because |
|---|---|---|---|
| Perceptual photo hash + duplicate identity | yes | **yes** — 4 photos hashed in prod, `phash_d` 16-hex, `phash_bytes` populated, 3 duplicate candidates found, 0 malformed; harness `hamming` ×35 | crop >5% defeats the match (measured d=15); 7/11 photos un-hashed (Supabase-hosted, not fetched by backfill) |
| Graduated enforcement / policy | yes | **yes at SQL level** — `openCase`→`warning`, owner ack ok, cross-member ack → `not-found`; `decidePolicy` ×12 harness | **advisory only**: nothing auto-bans; `suppressedUserIds()` returned 0 rows; no case has ever escalated past `warning` |
| Trust score | yes | **partly** — prod trust 46.00 read back; `computeTrustScore` ×13 harness | weights are my own calibration, not the platforms'; no signed-in HTTP test of `/api/trust/self` |
| Human challenge (PoW) | yes | **partly** — 18-bit solved in prod 40,452 ns/65 ms, `token_hash` `char(16)`, consumed to `failed` | `FREEBORN_HUMAN_CHALLENGE` unset → default `record`, so **it records and does not enforce**; measured solve-failure 4.7% at 20-bit |
| Identity anchor (`deriveAnchor`) | yes | **yes** — prod insert/consume round-trip | non-biometric by design: it is a photo-anchor, **not** a face embedding; FAR/FRR of FaceTec-class engines is not reproduced and I don't claim it is |
| Justice engine (dual-model content verdict) | code complete (`factCheckReport`, `askEngine`) | **no** | both providers empty → `ask()` returns `unconfigured`; `factCheckReport` returns `null` "only when both engines are down — in that case the report still lands in the human queue, unjudged". Today that is the **steady state**: every report is unjudged and human-queue-only |
| Face gate / liveness | MediaPipe blink + one-face + EAR, **on-device** | **no** | the blink verdict is client-asserted; I found no server-side re-verification, so it is spoofable by a crafted client. Not equivalent to FaceTec |
| Scam guard | pure regex `SCAM_PATTERNS`, engine-independent | flagging logic unit-exercised | not wired to any signed-in HTTP flow test; regex-only, no model |
| Dual-engine selfie check in `/api/verification/check` | stage 1 Antigravity + stage 2 LM7 sequential, `engine: lm7Configured() ? "dual" : "single"` | **no** | stage 1 unconfigured (empty keys) **and** stage 2 absent (`LM7_*` undefined) → truthful degradation path taken; verified only by reading the branch at line 515+ |
| TURN / call relay | — | **no** | unprovisioned, `relayConfigured:false` |
| CAPTCHA | client widget only | **no** | Supabase `security_captcha_enabled:false`, and no server-side Turnstile check in middleware or `/api/account`; signup goes browser→gotrue so our routes never see it. Stays off per your standing instruction |

Cross-cutting untested item, discovered while writing this: `GET /api/health/engines` — which would have
answered the engine-status question directly — returns `404 "Not found"` in production *by design* when
`FREEBORN_ADMIN_EMAILS` is empty (`route.ts:195`). So the app currently cannot self-report engine health to
you. Setting that var is the cheapest way to make every row above observable.

---

## 6. Remaining gaps and blockers

1. **REA was never applied to Bumble or Hinge until today, and both attempts failed** (OOM, exit 137). Their
   findings stand on my own scripted analysis — reproducible, but not REA output. Fix: re-run inside a larger
   memory envelope, or per-file with `--detail complete`.
2. **`--detail summary` without a written `--evidence_output` file yields no findings.** My bounded Bumble run
   exited 0 and produced metrics + limitation text only. Fix: `--detail complete`, or accept the bundle path
   that REA actually creates.
3. **`rea analyze-web-bundle` is unused.** Hand-rolled fetching is why chunk hashes rot and why 56/79 and
   67/79 of my reconstructed URLs 404'd today.
4. **Android is entirely absent as a covered surface.** No APK obtained/unpacked/decompiled; `rea doctor`
   confirms no `jadx`/`ghidra`/`hopper`/IDA. Every app-only mechanic is therefore either web-bundle evidence
   or a named operator statement, never "recovered from the app".
5. **Artifacts do not persist.** `re/app/*` and the 10 MB run-1 terminal output are gone; `rea doctor`'s raw
   output and run 1's bundle were never written to files. Reproducibility currently depends on public bytes
   still being served — they were today, they may not be next week.
6. **No authenticated HTTP round trip of any changed route** (prod session unobtainable without forging one:
   no service-role key, `vault.secrets` 0 rows, SMTP unset with `mailer_autoconfirm=false`, no Docker/CLI).
7. Prod answers **200 + HTML for unknown `/api/*`** (`x-matched-path: /_not-found`), which is exactly how a
   404 gets misread as success. Left unfixed deliberately; needs an operator decision.
8. Enforcement is **advisory**; `profile-photos` bucket lockdown, HIBP and `password_min_length` need the
   Supabase Dashboard (not settable via this connector); TURN unprovisioned.
9. `re/rea-tinder-main.json` is now parsed (this doc, §3). The run-1 `rea-tinder.summary.txt` (10,144,980 B)
   remains **unparsed** — it is the only surviving artefact that might contain the other four chunks' facts.
10. Your GitHub PAT is in chat history (`repo, workflow` scope) → **rotate**. It was never printed; `/tmp/.tok`
    was shredded and 0 occurrences exist in the workspace or in `.git` objects.

---

# Addendum, 2026-10-29 later in the day — engines made operable, and REA on Bumble/Hinge

Delivered against commit **`d10a6bc8ebceb0839429dd05fb4d4724ba4d981b`** (pushed fast-forward
`cff26a0..d10a6bc`, no force). CI run **`40846858047`** `completed/success`. Vercel
**`dpl_3dGsXAareDj7RVWL8NhbVMAVUs6u`** `READY` / `PROMOTED` / production, alias
`freeborn-umber.vercel.app`. Supabase migration **`2026-10-29-engine-operability`** applied through the
connector (`schema_migrations` 27 → 28).

## A.1 A live defect §5 of this report could not have found

The reason/CHECK drift was invisible to every check in this file, including my own "9 constraints live,
`reports_reason_check` = the 12-value list" verification: I had confirmed the constraint existed and
matched the *migration file*, never that it matched the **app's** accepted values. Consequence, measured
before the fix:

```
insert into public.reports (reason) values ('safety')  ->  ERROR: 23514   # report destroyed, HTTP 500
```

`underage` and `ai_generated_media` were absent from the live CHECK too, and `inappropriate_content`,
`spam`, `nudity`, `violence` were absent from the app. Three lists (live DB, `schema.ts`, the route)
disagreed with each other. Fixed by reconciling all three, normalising legacy values instead of
rejecting them, and guarding the insert so a CHECK can never destroy a report again.

## A.2 Engine status after this change

| Engine | Implemented | Configured | Live-tested | What is still missing |
|---|---|---|---|---|
| Photo hash + duplicate identity | yes | **yes, complete** | **yes**: backfill ran against production, 7 hashed → **11/11**, re-run reports 0 unhashed (idempotent); 40 cross-account pairs, closest Hamming **14** vs threshold 10 → **0 matches (a true null result)** | crop >5% still defeats it (d=15) |
| Human challenge (PoW) | yes, + browser solver | `FREEBORN_HUMAN_CHALLENGE` **unset** → `record` | route live (401 anon, 403 cross-origin); solver 136/136 incl. 400-input agreement with the server predicate and a mocked issue→solve→verify→token round trip | **never enforced**: 18-bit is not browser-feasible (measured ~8.5 k hash/s, ~31 s avg, 4M budget did not finish in 242 s), so a new 12-bit `browser` tier exists; a real member session has not exercised it |
| Selfie liveness / identity match | freshness gate | yes | route mounted (`x-matched-path` correct, 401/405/403 as designed); consumption logic unit-asserted | no signed-in round trip; **still no proof a live human was present** — blink stays client-asserted, unchanged |
| Dual-model report moderation | yes | **no** — all four keys defined, values empty | no new report row since deploy (2 open rows carry `triage = null`, pre-dating the column) | needs real model credentials; `triage='pending'` now makes the outage visible instead of silent |
| Scam detection | 22 weighted rules / 9 categories | n/a | `openCase` reuse verified at SQL level previously | **fixed a dead control**: escalation required score ≥ 70 with history, but cap made 45+20 = 65 the ceiling — unreachable. Now reachable, and asserted reachable |
| Risk-based enforcement + human review + appeals | read-only queue | `FREEBORN_ADMIN_EMAILS` **empty** | `GET /api/admin/review-queue` → 404 fail-closed (its own design) | **no write path, deliberately** (see A.3); `reports.reviewed_*/resolution` and `appeals.verdict` still have no writer |

## A.3 The decision I did not override

`REVIEW-SURFACE-DESIGN.md` §2 refuses an admin write panel because Freeborn has no admin identity model
and the quick route is a shared token — the exact failure behind Unject's 2022 dashboard leak (~3,500
members) and 2024 DM/location leak. Under "preserve existing features and prior design decisions" I kept
it: the queue is read-only, redacts whole emails, chat content and storage keys, and the write path stays
the one-transaction SQL runbook that records its own `moderation_actions` row. So "human review" is now
*measurable* but still not *clickable*. That is a deliberate unfinished state, not an oversight.

## A.4 REA on Bumble and Hinge — bounded runs, and what they did and did not add

The memory-safe recipe (one `--source-path` per run, `--max-semantic-nodes 4000`, `--max-heap-mb 640`,
`--analysis-timeout-ms 180000`) completed instead of being OOM-killed at exit 137:

| Run | Result | REA output |
|---|---|---|
| Hinge `870-bfaf586cb29ee09b.js` | exit 0 | 10,776,436 chars; 475 recovered call sites; 243 nodes/edges; authorities `artifact-bytes`, `ast-static-analysis`, `shipped-artifact`, `static-relationship-in`; confidences `exact`/`high`/`derived`/`unknown` |
| Bumble `973dca4db395beb0.js` | exit 0 | 10,964,457 chars; **1,029 call sites**; 187 nodes/edges; recovered `call:localStorage.getItem` and `call:localStorage.setItem` |
| Hinge `_buildManifest.js` | exit 0 | 1,216,670 chars |

**What REA added to the Bumble device-identity claim: nothing.** I checked specifically — `DEVICE_ID`
occurs **0 times** in that run's output, and the two `localStorage` facts do not name a key, so they do
not corroborate `v.get(f.DEVICE_ID)`. That finding still rests on my own scripted analysis of the bytes,
and §3's attribution stands corrected rather than quietly upgraded.

What the two runs do add is a **corroborated negative**, with REA's own caveat attached: across ~21 MB of
recovered static facts for both apps, zero `/api/…` endpoint literals and zero verification-vendor module
identifiers were recovered, while REA reports `coverage is incomplete; omitted or dynamic facts must not be
interpreted as absence`. So "no verification runtime in the public bundles" remains *consistent with* the
evidence and is **not** proof of absence — exactly the distinction §2/§3 of this report was written to keep.

Reproduced REA CLI shape:

```bash
rea analyze-javascript-application <dir> --source-path <one-file> --detail complete   --max-semantic-nodes 4000 --max-semantic-nodes-per-file 4000   --max-semantic-unknowns 4000 --max-semantic-unknowns-per-file 4000   --max-heap-mb 640 --analysis-timeout-ms 180000 --integrity-policy fail
```
