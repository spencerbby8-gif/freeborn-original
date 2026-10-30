# Mechanism map — Bumble / Hinge / Tinder vs Freeborn
**2026-10-30 · evidence dir `re/analysis-2026-10-30/rea/` · bundles `re/analysis-2026-10-29/{bumble,hinge}`, `re/bundles/`**

## 0. Method, and what it can and cannot show

**Inputs, all re-verified this turn.** 46 SHA256 digests in `rea/SHA256SUMS`; **37/37 acquired
files hash-match the acquisition manifest `_manifest.json` — 0 mismatches, 0 missing** — so the
surviving bundles are bit-for-bit the bytes acquired on 2026-10-29 and any finding below can be
re-derived. REA restored to `rea-agents@6.8.0` on Node v24.22.1 (`--version` exit 0); commands and
exit codes in `rea/commands/`.

**Campaigns run this turn.**
- `rea-perfile.sh bumble hinge` — one REA invocation per source file (bounded, resumable):
  **37 runs, 36 × exit 0, 1 × exit 1**. Per-run status in `rea/perfile-index.json`, artifacts
  xz-compressed in `rea/perfile/*.xz` (254 MB → 25 MB, nothing discarded).
- `rea-extract-modules.py` + a derived-module campaign for the one failure
  (`bumble/4101edefd833a9ef.js`, 376,898 B on a single line, which had defeated three earlier
  attempts): split on the bundle's **own webpack module boundaries** → 13 modules, **99% of bytes
  accounted for**, then REA per module: **13/13 exit 0** (`rea/perfile-derived/`).

**Two methodological findings, both negative, both worth keeping.**
1. REA at `--detail summary` produced **no** record touching the image ladder, blur placeholders or
   retry policy — its summary layer on minified framework chunks reports structure, not these
   details. The load-bearing facts below therefore come from a deterministic regex mine over the
   acquired bytes (`rea-mine2.py` → `rea/MINING-PRECISE.json`, every hit with file + byte offset).
   Claiming "REA found the width ladder" would have been false.
2. My first mine was **wrong by inflation** and the errors are recorded rather than deleted:
   `verification_liveness: 423` in Bumble was Danish marketing copy containing "selfie";
   `upload_transport: 70` was React's `slice(0,5)`; `resumable_chunks: 58` was React 18's
   `resumableState`/`progressiveChunkSize`; Hinge's `image_transform: 117` was framer-motion
   `rotate`/`scale` and video.js listeners; an unbounded `persona` matched Tinder's
   "personalizedOffer" 80 times. Every pattern in the second pass is word-bounded and ships with a
   `why` stating what the string does *not* prove. A count is not a finding.

**Acquisition limits that cap every row below.** Tinder = HTML shell only (no JS chunks ever
acquired). Bumble/Hinge = the chunks their entry page references — lazy route chunks, the iOS/Android
clients, and all server code are outside the surface. So `0` means **"not present in these files"**,
never "the product lacks it". REA cannot see request handling, ranking, storage ACLs or what a
server does with a field; nothing below asserts that it can.

## 1. The map

Evidence class per cell: **[C]** confirmed string/mechanism in acquired bytes with an offset ·
**[M]** manual observation · **[I]** inference (labelled) · **[?]** unknown by construction.

### 1.1 Photo delivery and renditions
| | finding |
|---|---|
| Hinge **[C]** | `deviceSizes:[640,750,828,1080,1200,1920,2048,3840]`, `imageSizes:[16,32,48,64,96,128,256,384]`, `path:"/_next/image"`, `loader:"default"`, `dangerouslyAllowSVG:!1`, `unoptimized:!1` — `132-4be892819dbac6b1.js@796`, `@924`, also `main-dd66a77f47b92c0d.js@38816` |
| Bumble **[C]** | `deviceSizes:[320,640,768,1024,1366,1600,1920,2048,2560]`, `imageSizes:[368,736,608,1218,…]`, `path:"/_next/image/"`, `dangerouslyAllowSVG:!1`, `unoptimized:!1` — `7baa63ca4f39942f.js@1142960`, `@1143152` |
| Tinder **[?]** | not in the acquired shell |
| Problem it solves | one original per photo, many display sizes: DPR-correct bytes, no layout jump, and the optimizer refuses to rasterise attacker-supplied SVG |
| Freeborn today | `resolvePhotoUrl()` returns the raw public-bucket URL; every consumer puts it in `<img src>` — one size for a 40 px avatar and a full-screen photo, no optimizer |
| Decision | **Do not bolt on `next/image` now.** It would require `remotePatterns` for a public bucket and would change our caching posture, while the SVG half of the risk is already closed *earlier* — the bucket now refuses every mime outside `jpeg|png|webp` at upload, which is stronger than refusing to render them. Recorded as a candidate with that reason, not silently dropped. |

### 1.2 Rendering failure — the mechanism that matters most for "my photos disappeared"
| | finding |
|---|---|
| Hinge **[C]** | `placeholder:"blur"` on profile-photo images (`107-74b360892d40f6c4.js@2528`, with `sizes:"(max-width: 767px) calc(100vw …)"` and `priority` for index ≤ 2), and the blur data comes from CMS metadata: `blurDataURL:e.asset.metadata.lqip` (`298-fd2f7dd5ebd20a78.js@1697`); `qualities` ladder in `132…@895`. Previews are built locally: `URL.createObjectURL(await e.blob())` next to a status check (`487-c89d8ac1c56f4891.js@1430`) |
| Bumble **[I]** | `blurDataURL`/`placeholder` appear only inside the prop list of its vendored next/image (`7baa…@1149181`) — **not** evidence of app-level use |
| Problem it solves | a slow or failed image degrades to a soft colour block instead of the browser's broken-image glyph, and the member sees *something* shaped like the photo while it arrives |
| Freeborn today | nothing. A row whose bytes cannot be fetched renders a broken-image icon — which is exactly how both production defects last turn were *experienced* by members while the rows themselves looked healthy |
| Decision | **Build it, Freeborn's way.** We already store `profile_photos.phash_bytes`, the downsampled grayscale used for duplicate detection — the same information class as an LQIP, computed at upload, no new pipeline, no CMS. Plus an explicit error state on the image itself. See §3 |

### 1.3 Upload transport and durability
| | finding |
|---|---|
| All three | **no resumable/chunked uploader** in the acquired surface: `resumable_chunks` 0 real hits after excluding React's `resumableState`; `progress_put` only Hinge `t.upload.onprogress` inside its axios adapter (`132…@64276`) — [C] that the HTTP client *can* report progress, not that uploads do |
| Hinge **[C]** | a retry policy with visible defaults in the image layer: `maxRetries \|\| 5`, `retryDelay`, `shouldRetry`, `attemptNumber` (`132…@35202`, `@35299`) |
| Problem it solves | a single transient failure (flaky mobile uplink) should not cost the member the upload they just framed |
| Freeborn today | onboarding keeps its draft client-side (so a failed *submit* is recoverable) and now mirrors into Postgres when the bucket refuses a file; **nothing retries a failed media *fetch*** |
| Decision | **adopt the retry-with-bounds, reject resumable uploads.** Chunked uploads would be a new subsystem the competitors demonstrably do not have on web, for a benefit our members are not reporting. A bounded retry on media fetch is ~40 lines and addresses the same failure class |

### 1.4 Realtime messaging
| | finding |
|---|---|
| All three **[?]** | `new WebSocket(` / `wss://` / socket.io / ably / pusher / centrifuge: **0 hits** in the acquired files (Hinge's `onmessage`/`reconnect` hits are video.js). Their chat transport is not in this surface → **unknown**, and this row is deliberately not a conclusion |
| Freeborn today | **[C by source read]** Supabase Realtime is wired and used for *calls* only: `fb-ring:${user.id}` / `fb-call:${callId}` (`src/lib/call-bus.ts`, `call-listener.tsx`). **No channel for chat messages**, and `postgres_changes` appears nowhere in `src/` → a member's inbox only advances on refetch |
| Decision | **fix our own gap, not a competitor's rule.** The transport we already depend on is unused for the highest-frequency surface in the product. No competitor behaviour is imported — Bumble's women-message-first and expiry timers remain explicitly out of scope |

### 1.5 Identity verification and liveness
| | finding |
|---|---|
| Tinder **[C]** | first-party selfie flow, from its own i18n keys: `SelfieChallengeV2.intro.getVerified:"Get Verified"`, `SelfieChallengeV2.intro.title:"We n…` (`bundles/tinder.index.html@179642`); 80 hits for that vocabulary in the shell |
| All three | **no third-party verification vendor string** in the acquired web surface: `\bjumio\b`/`onfido`/`veriff`/`yoti`/`idensic`/`mldl`/`age[ _-]estimation` → 0 for bumble and hinge, 0 for tinder. The one [C] hit for `verification_vendor` in all of Tinder's file is that `SelfieChallengeV2` copy |
| Bumble | its identity vocabulary in `7baa…` is **marketing copy**, not code (mirror-selfie strings, 418 hits on the loose pattern → 0 on the precise one) |
| Problem it solves | a selfie challenge is posed and judged by the platform, so it can be varied, re-posed and kept honest; a vendor SDK is a fixed prompt an attacker can replay |
| Freeborn today | first-party two-stage: consumed single-use pose challenge + freshness + model verdict (`verification_challenges`, `human_challenges`, `identity-match.ts`), no vendor |
| Decision | **our architecture matches the strongest observed pattern; keep it.** What the vendor's server does with frames, and what Tinder does with a selfie, are **[?]** and no claim is made. The pending `b3ca64c8…` row is untouched by this work |

### 1.6 Device integrity and fraud signals
| | finding |
|---|---|
| Bumble **[C]** | `a.device_id=e.deviceId` attached to every telemetry call (`7baa…@1607`) and a field list `["filename","lineno","colno","user_id","device_id","app_version","app_build","app_label","deploy_info",…]` (`@3756`) — a stable per-install id **plus release attribution** on every event. 11 `device_integrity` hits concentrated in that one file; the obfuscated `window.indexedDB.open(a.CWeQh)` helper (`@1167586`) is a third-party store I will not name from a mangled key |
| Hinge | 29 hits, all in `_app-7f50c6d6b07df510.js` |
| Problem it solves | one human, many accounts — the id is what makes cross-account abuse visible at all |
| Freeborn today | `browser-integrity` observations (consistency signals, `NEVER_COLLECTED` denylist), `security_events`, and per-photo `phash` anchor matching for cross-account duplicate faces — the last is *more* targeted than a device id for the abuse we actually see |
| Decision | **no new fingerprinting.** The niche promise is autonomy; adding a device graph would cost trust to buy a signal we already get from face-anchor matching. One cheap borrowing: `app_version`/`deploy_info` alongside security events, so a spike can be attributed to a release. Optional, not built this turn |

### 1.7 Privacy controls — verified Freeborn defect, not a competitor finding
`profile_photos` and `user_profiles` policies do **not** enforce `incognito` from `user_private_settings`; the 2026-10-16 migration records this as a deliberate `KNOWN GAP` with the constraint that both policies and the route layer must change together or they will disagree (the audit's H3 finding). Competitors market the control (`privacy_controls`: Bumble 98 hits across 6 files, Tinder 11) — but that string evidence does **not** tell us how it is enforced, and Freeborn's gap stands on our own defect, so it needs no competitor to justify fixing it.

### 1.8 Monetization — mapped and consciously out of scope
`monetization` is dense in Bumble (`135` hits, 98% in one file) and Tinder's shell carries `paypal`/`personalizedOffer`; Hinge is thin (12). Freeborn has no payment provider, and no part of its thesis depends on one. Recorded so the absence is a decision, not an oversight. **[?]** for every price, entitlement and paywall rule — none of it is derivable from these bytes.

### 1.9 UI structure — **acquisition gap, and therefore no UI claims this turn**
`tab_labels` = **0** for all three, and Bumble's 136 `ui_tokens` hits are one third-party widget's CSS (`@keyframes spin`, `.tf-v1-popover{bottom:96px…}` in `973dca4db395beb0.js`), not its design system. **I am not able to describe Bumble's typography, spacing scale, button hierarchy or tab arrangement from what is in the workspace, and I will not invent it.** The specific missing inputs, in order of value:
1. the `.css` chunks referenced by `analysis-2026-10-29/*/​_entry.html` (never fetched — `acquire.mjs` filtered to `.js`/`.html`);
2. `_buildManifest.js`/`_ssgManifest.js` route lists (acquired, analysed, exit 0) for screen *inventory*;
3. screenshots — outside REA entirely, and the only way to see arrangement.

## 2. Confirmed / inferred / unknown, in one place
**Confirmed [C]:** both apps run `next/image` with explicit width ladders, SVG refused at the optimizer, `unoptimized:false`; Hinge uses `placeholder:"blur"` with `lqip` from CMS metadata, blob-object-URL previews, and a `maxRetries:5` retry policy in its image layer; Bumble sends `device_id` + `app_version`/`deploy_info` on telemetry; Tinder's selfie verification is a first-party `SelfieChallengeV2` flow; no verification-vendor SDK and no chunked uploader in any acquired file.
**Inferred [I]:** that a shared `/_next/image` optimizer plus a width ladder is *why* no per-size renditions are uploaded (one original, derived on request) — consistent with every config found, not proven by it.
**Unknown [?]:** every server behaviour — storage providers, ACLs, signed URLs, caching TTLs, delivery CDNs, ranking, matching, verification verdicts, chat transport, paywalls; all of Tinder's JS; all lazy chunks and all native clients.

## 3. What this turn built from it
1. **Media authorization is now an executable rule** (`src/lib/media-access.ts`) instead of an inline boolean, tested per role over the full 96-combination fact space — the direct answer to "test across profile owners, eligible viewers, senders and recipients" when two live member sessions are unavailable. 298/298 harness assertions.
2. **Right-to-erasure hole closed**: account deletion dropped `profile_photos` rows and left every image in the *public* bucket with no row to attribute it. It now sweeps `profile-photos` **and** `verification-selfies` (face scans) first, best-effort, pinned as an **ordering** property — sweeping after the delete loses the only index that points at the objects.
3. **Render-failure work (§1.2) and chat realtime (§1.4) are the two next builds**, both motivated by our own defects with competitor practice as corroboration; neither is in this changeset and neither is claimed as done.

## 4. Preserved for reproduction
`rea/SHA256SUMS` · `rea/MINING-PRECISE.json` (+ `.public.json` without quoted bytes) · `rea/perfile-index.json` · `rea/perfile/*.xz`, `rea/perfile-derived/*.xz` · `rea/commands/{npm-ci.log,restore-*.log,extract-4101.log,perfile-campaign.txt}` · `rea/tinder-recovered/rea-tinder-main.json` (partial-observation evidence from the earlier run; its two 10 MB logs were the timeout text and were dropped, originals remain `xz`-ed in `re/`) · scripts `re/rea-perfile.sh`, `re/rea-extract-modules.py`, `re/rea-mine.py`, `re/rea-mine2.py`, `re/resume-rea.sh` · `analysis-2026-10-30/sql/account-delete-fk-coverage.sql` (not yet run — see below).

**Open verification item, saved rather than guessed at:** account deletion enumerates 29 tables by hand. Which tables have FKs to `user_profiles`/`accounts`/`auth.users` that the list omits (candidates seen this session: `human_challenges`, `moderation_cases`, `moderation_notes`, `duplicate_photo_hits`, `profile_moments`, `moment_comments`, `moment_reactions`, `open_questions`, `profile_prompts`, `user_visibility_windows`, `verification_integrity_events`, `verification_pose_attempts`, `free_quota_grants`) is a one-query question I could not run this turn because the Supabase connector is unavailable in this reply. The query is in `sql/account-delete-fk-coverage.sql`. **Until it runs, "account deletion removes all member data" is unproven**, and rows that are neither deleted nor FK-blocked would silently persist.
