# Implemented from the REA evidence — media resilience, API failure handling, and the shared UI contract

Date: 2026-10-30. Status: **committed, all gates green, NOT DEPLOYED.**
Repository: `spencerbby8-gif/freeborn-original`, branch `main` at `1163414` + 5 local commits.
Production (`freeborn-umber.vercel.app`, `dpl_DDYJLpTexk6H1BgDM2GBmNbAbiuE`) still runs the
pre-media-recovery code: nothing in this folder has been pushed, because no token exists in
this session and pushing was explicitly out of scope.

This is the file that answers "REA research must drive development, don't stop at reports".
Every change below names the byte-level observation that justified it.

---

## 1. What shipped in code

| File | Change | Why (evidence) |
|---|---|---|
| `src/lib/api-response.ts` | new: `readJsonSafe`, `describeFailure`, `isRateLimited`, `retryDelayMs`, `fetchWithRetry`, `retrySrcFor` | Tinder's transport wraps every parse so a non-JSON body returns the raw response instead of throwing; it gives a 429 a 60 s floor (`429===t&&(o.all=s+6e4)`) and skips its own telemetry for 429; Hinge retries with a bounded default and a caller predicate (`maxRetries||5`, `retryDelay`, `shouldRetry`, `attemptNumber`). Offsets in `MINING-API-STATE.public.json`. |
| `src/lib/call-bus.ts` | `await res.json()` → `await readJsonSafe<RTCConfiguration>(res)` | The old code was *worse than a crash*: an HTML 502 from the proxy threw inside the `try`, was caught by the surrounding `catch`, and silently returned STUN-only ICE — the configuration that fails on carrier networks with no message to either party. |
| `src/components/ui/photo-image.tsx` | new renderer: skeleton placeholder, bounded backoff re-request (3), cache-busting `?r=` on same-origin paths only, **spoken failure state**, fade-in on load, `decoding="async"`, reduced-motion respected | The four media-defect mechanisms in `MEDIA-DISAPPEARANCE-2026-10-30.md` were all *experienced* as a silently broken image. Hinge's client keeps a preview alive (`487-…js@1434 URL.createObjectURL(await e.blob())`) and renders a placeholder from an LQIP (`298-…js@1697 blurDataURL:e.asset.metadata.lqip`); its retry loop is `132-…js@35519 attemptNumber` / `@35609 shouldRetry`. We take the **shape** (placeholder → retry → explicit error), not the blur asset or the look. |
| `src/components/ui/button.tsx` + `globals.css` | new `Button` (5 variants, 3 sizes, `block`, `loading` → disabled + `aria-busy`) on `.fb-btn` classes; `@theme` gains `--text-ui-xs…xl`, `--radius-card`, `--control-h-sm/md/lg` | The repo had **155 raw `<button>` sites and no `src/components/ui/`** — four heights and three radius vocabularies, so "primary action" differed per screen. Bumble themes buttons through custom properties (`--button-background-color/-color/-border-*`) and paints hover/pressed as **overlay layers** (`--button-overlay-background-hover`, `--button-overlay-background-pressed`), which is why its label contrast cannot drift per state. |
| `scripts/trust/harness.ts` | section `[16]`, 25 assertions | See §3. |

The measured scale, not an invented one: Bumble's stylesheet declares six working sizes
(13/15/17/20/34/49 px) with 15 px and 17 px dominating at 224 declarations each, radii
clustered on 16 px plus a 1000 px pill and 50 % circles, and a 4 px gap lattice
(8/12/16/20/24/32/40). Those became `0.8125/0.9375/1.0625/1.25/2.125rem`, `--radius-card:
1rem`, and a 44 px minimum control height. Re-derivation is scripted:
`re/rea-tokens.py` → `DESIGN-TOKENS.json` (2,374 custom properties parsed out of
`bumble.7050c3776fb2414d.css`, 822,045 bytes, sha256 in `ACQUIRED-2026-10-30T.manifest.json`).

## 2. Mechanisms we deliberately did **not** adopt

* **`next/image`.** Both competitors configure a device-size ladder
  (bumble `7baa63ca@1142960` `deviceSizes:[320…2560]`, `path:"/_next/image/"`; hinge
  `132@796` `[640…3840]` + `qualities`). Adopting it means `remotePatterns` plus a caching
  posture change on a route family we just re-secured with private `no-store`. The upload-time
  MIME+size allowlist and our own `?r=` retry cover the same goal with less blast radius.
* **Their `dangerouslyAllowSVG:!1`** is agreement, not adoption — our allowlist already refuses SVG.
* **Device fingerprinting.** Bumble sends `a.device_id=e.deviceId` and
  `"app_version","app_build","deploy_info"` (bumble `7baa63ca@1607`, `@3756`). Freeborn's
  promise to this community is that we do not build member fingerprints; we keep
  `browser-integrity` observation-based and collect none of that.
* **Product rules.** No women-message-first, no match expiry, no ranking import. And nothing
  about vaccination status is inferred anywhere: it stays a self-declared, privacy-controlled
  field, which is also why `retrySrcFor` refuses to touch anything but our own media paths.
* **Resumable chunked upload.** Zero occurrences of `resumable_chunks` in any acquired bundle —
  the earlier hypothesis was unsupported, so no migration was written for it.

## 3. Verification actually run (not planned)

```
npm run test:harness  →  ALL PASS (323/323 assertions, 0 failed)   [was 298/298; +25]
npx tsc --noEmit      →  0 errors
npm run lint          →  clean
npm run build         →  ✓ Compiled successfully
npm run check:secrets →  secret scan OK — 289 tracked files scanned
```

`[16]` pins *behaviour* of the shipped module, imported through esbuild's `@/` alias — the real
`src/lib/api-response.ts`, not a re-implementation: HTML 502 body → `null` and no throw; empty
body → not an error; server message wins; no status yields an empty message; only 429 is a
throttle; `Retry-After` beats the local guess and is clamped; a 429 with no header waits 60 s;
5xx backs off 400 → 1,600 → capped 20,000; GET retried to the bound then returned not thrown;
**POST never retried** (a duplicate like/report is the worse bug); 400 never retried; first
success stops the loop; network error retried and still surfaced; cache-buster rewrites
same-origin paths only and refuses absolute, protocol-relative and `data:` URLs. Four pins then
guard the wiring and the CSS contract (overlay hover, capability gate, `:focus-visible`,
reduced-motion, tokens present, loading ⇒ disabled, render-time reset, failure stated aloud).

Three of these found real bugs **in my own first cut**, which is the only reason to have them:
the 60 s floor was being clamped by the 5xx cap (silently back to 20 s = hammering a server that
asked to be left alone); an absurd numeric `Retry-After` fell into the HTTP-date parser and
`Date.parse("99999")` resolves in V8 as a year → a two-minute wait invented out of nothing; and
`new Response("", {status:204})` is illegal in undici (null-body status), which killed the harness.

## 4. Research limits on this step — read before citing anything above

1. **Client-side only.** Every claim here is about what a competitor's shipped browser bundle
   *does*. Nothing reveals what their servers do, how they rank, or how they store. REA and
   byte-mining cannot see server logic, and no statement in this repo should be read as one.
2. **Hinge's UI layer is unobtainable from this sandbox.** `hinge.com` and `www.hinge.com` both
   return `000` (connection failure), retried. So Hinge contributes only its 2026-10-29 JS.
   Hinge's token layer, focus styling and hover gating are **unknown, not absent**.
3. **`state_lib`, `http_lib`, `signed_upload`, `chunk_upload`, `cache_lib`, `gql_op` counts of 0
   are pattern limits, not facts.** Minifiers rename `axios`/`createSlice`; these clients put
   status codes in the body via typed error classes. "Not resolvable from these bytes" is the
   correct conclusion and is recorded as such.
4. **Two counts I published earlier this session were wrong and are corrected here:** bare `429`
   (tinder 204 / bumble 108 / hinge 32) was almost entirely webpack module ids (`a(47429)`) and
   Bumble i18n counters plus SVG path data — ~3 real hits; and Tinder's 829 `state_lib` hits were
   **828 × `createSelector`** (reselect), i.e. one dominant token, not a diverse stack. Lesson
   recorded: never report a pattern count without reading its samples.
5. **REA's agent layer on the 17 newly acquired bundles does not exist, and here is exactly why.** Four attempts, four different causes, all logged under
   `re/analysis-2026-10-30/rea/perfile-20261030b|c|d/` with per-file exit codes: (a) `analyze-javascript-file`
   is not a command (`COMMAND_NOT_FOUND`); (b) `rea` is absent from a bare shell's PATH (rc 127); (c) under node
   v20, `rea-agents@6.8.0` dies on `SyntaxError: The requested module 'node:zlib' does not provide an export named
   'zstdDecompress'` — it needs the pinned v24.22.1 that `re/resume-rea.sh` extracts to `$HOME/.local/toolchain`;
   (d) with the right node and the right subcommand, **`analyze-javascript-application` refuses a single file**:
   `code: unsupported_target … accepts only a directory or an .asar file`. The 2026-10-29 corpus works because
   `re/rea-perfile.sh` stages each bundle in its own directory (and `re/rea-extract-modules.py` splits oversized
   bundles, which REA otherwise cannot analyse at all — `4101edefd833a9ef.js` still cannot be analysed whole at any
   setting). So the citable analysis for the new files is the deterministic byte-mining pair
   (`rea-mine3.py` 25 patterns × 3 apps with file@offset samples; `rea-tokens.py` for CSS), both copied into this
   folder. Re-running REA over them is a next-run task, not a gap in any claim below or above.
6. **Not verified by anything here:** that the new UI reads well in a browser. There is no visual
   regression harness, no Playwright run against a deployed build, and no member testing. The
   pins prove the tokens exist and the classes are wired; they cannot prove taste or that a
   particular card still fits its viewport.

## 5. Open work, in priority order

1. Wire `PhotoImage` into `photo-lightbox.tsx` (needs `imgClassName="object-contain"` — the
   prop exists now) and the chat shared-photo tile + staged preview in `chat-view.tsx`.
2. Migrate the 155 raw `<button>`s to `Button` incrementally, screen by screen, starting with
   auth → onboarding nav → discover → settings. Do not bulk-replace: several sites carry
   bespoke `aria`/gesture handlers (double-tap-to-like) that must survive.
3. `chat_media.match_id` is `onDelete:"cascade"` while `api/chat/unmatch/route.ts:31,35` and
   `api/likes/route.ts:143` both `delete(matches)` — verify whether `messages` survives an
   unmatch; if it cascades too, that is a **fifth** disappearance mechanism and needs a
   migration before any more media work is claimed complete.
4. Chat realtime: `src/lib/call-bus.ts:64,70` subscribes only `fb-ring:<userId>` /
   `fb-call:<callId>`; `postgres_changes` appears nowhere in the app, so new messages do not
   arrive without a refetch.
5. Run `sql/account-delete-fk-coverage.sql` against the project — until then "account deletion
   removes all member data" is argued from `~28` explicit deletes, not proven.
6. Delete the 1 orphan object in `profile-photos` (Dashboard only; no storage tool here).
7. Owner's two admin probes, then the 14-row test-account cleanup.
8. `fetchWithRetry` is currently a library with a caller; wire it into the discover/feed GET so
   the throttle floor is actually exercised in production, and add `X-Retry-At`-free logging of
   `attempts` into `security_events` only if it never carries member content.

## 6. Reproducing the evidence

```bash
# acquire (52-row plan → 23 files kept, 29 rows failed, all recorded)
python3 re/rea-tokens.py     # → re/analysis-2026-10-30/DESIGN-TOKENS.json
python3 re/rea-mine3.py      # → re/analysis-2026-10-30/rea/MINING-API-STATE.json
```
Both scripts are copied into this folder (`rea-tokens.py`, `rea-mine3.py`) so the derivation
survives the workspace. Competitor bundles are **not** committed; `ACQUIRED-2026-10-30T.manifest.json`
holds the size + sha256 + keep-path for all 23 files (5,744,053 bytes) so every `file@offset`
citation resolves to a byte-exact artifact, and `MINING-API-STATE.public.json` is the sample-text-
stripped version of the mine (offsets kept, verbatim third-party source not shipped).
