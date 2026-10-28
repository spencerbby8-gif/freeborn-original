# FREEBORN audit — 2026-10-28 (sandbox, Arena agent)

Scope actually audited, with the exact artefact each claim came from. Every number below was
produced by a command or API call in this session; nothing is inferred from commit messages.

| Layer | Artefact | Verified how |
|---|---|---|
| Code | `spencerbby8-gif/freeborn-original` @ `fda146e7de22aacf1eb5e46c7d5518bd4b33da6e` | `git clone --depth 50`, then read files |
| Front door | Vercel project `freeborn` = `prj_3Y6fEI3YedWsffXGHXWPwesu7BOL`, alias `freeborn-umber.vercel.app` | `vercel__list_projects`, `__list_env_vars`, `__get_env_var`, `__list_deployments` |
| Data | Supabase project `Freeborn`, ref `ihwtpwlszegrjgakqsxx`, PG 17.6.1.141, us-east-1, ACTIVE_HEALTHY | `supabase__execute_query` (read-only SELECTs) |
| Live app | `https://freeborn-umber.vercel.app` | `curl` GETs on read-only routes |

Naming note: the Vercel **project** is called `freeborn`. `freeborn-umber.vercel.app` is its
production **alias**. Deployment `dpl_67a7NbTYoFjr4qvPVKsN39DWop8i` is built from `fda146e`
(repo `repoPushedAt` 1793148754000 → ready 1793148784617, promoted to production), so
**production is current with `main`** — no deploy lag.

---

## F-A. Engine ladder can burn 3–5× the budget that wraps it (the "slow / no answer" class)

**FOUND.** `callEngine()` walks `models × RUNGS` sequentially. Engine 1 (`antigravity`) has 3
models and `RUNGS` = `strict`, `reasoning`, `minimal` → up to **9 sequential upstream calls**.
Per-attempt abort: **35 000 ms** in `src/lib/moderation.ts:69,72` and **20 000 ms** in
`src/lib/identity-match.ts:289,292`. The whole thing is wrapped in `withBudget(..., ENGINE_BUDGET_MS, () => null)`
and `src/lib/engine-budget.ts:57` sets `ENGINE_BUDGET_MS = 20_000`.
Worst-case ladder wall clock: moderation 9 × 35 s = **315 s** against `maxDuration = 60`
(`reports/route.ts:9`, `appeals/route.ts:9`); verification 9 × 20 s = **180 s** against
`maxDuration = 120` (`verification/check/route.ts:8`). The 20 s budget always wins first.

**ROOT CAUSE.** The budget was sized for the old Netlify cap, not for the ladder the F2 rewrite
introduced. `src/lib/engine-budget.ts:4` still says *"Netlify caps synchronous functions at 26
seconds on paid plans"*, and `:53` says the budget "leaves room under the 26s platform cap".
The product moved to Vercel (`netlify.toml` and `deploy-netlify.yml` deleted in `fda146e`;
`DEPLOY.md:6` "nothing in the running product uses Netlify"), so the number is now a stale
assumption rather than a constraint. Consequence: the first slow-or-hanging gateway attempt
(abort at 35 s) already exceeds the 20 s budget, so **any** gateway hiccup resolves the race
with the fallback — `verdict = null` → report triage and appeal investigation silently degrade
to "investigation pending: engine budget exhausted" (`appeals/route.ts`), and `triage` stays
incomplete on reports.

**FIX.** Either shrink the ladder to the budget (per-attempt timeout ≤ 6 s, and stop after N
attempts rather than walking all 9) or raise the budget and lower the ladder depth, and align
`maxDuration` with the Vercel plan cap. Minimum safe shape: `timeoutMs ≈ ENGINE_BUDGET_MS / 3`,
`models.length × RUNGS.length ≤ 3`, plus a `giveUpAfterMs` inside `callEngine` so the losing
promise is aborted instead of "keep[ing] running server-side until its own abort fires"
(documented at `engine-budget.ts:19-22`).

**BEFORE / AFTER.** Not patched — this is an audit, not a fix. Model of the difference: today a
single 429/502/slow rung means the request answers in ~20 s with a *degraded* verdict and no
error anywhere; with a matched ladder the same call either completes or says so.

**LIVE TEST.** `/api/health/engines` is the intended measurement, and it is currently unreadable
(see F-B), so the ladder has never been observed live from production. Read-only production
probes run instead: `/api/health` → `{"ok":true}` HTTP 200 in 2.03 s.

**REMAINING LIMITATION.** `ANTIGRAVITY_*` / `VOID_AI_*` exist as Vercel keys but are
`type: sensitive`, so their values are never returned by the API. I therefore **cannot state
whether the engines are configured with working endpoints** — only that the key names are
present, production-scoped, created 2026-09 (1792096235151 … 1792096569669). The ladder's cost
is structural and independent of that answer.

---

## F-B. `/api/health/engines` is fail-closed to the point of being unreachable — and not in dev/preview at all

**FOUND.** `GET https://freeborn-umber.vercel.app/api/health/engines` → `Not found`, HTTP **404**,
1.37 s. Code reason, `src/app/api/health/engines/route.ts`:
```ts
if (adminAllowlist.length === 0) return new Response("Not found", { status: 404 });
const member = await getMember(request);
if (!member || !adminAllowlist.includes(member.email.toLowerCase())) return ...404;
```

**ROOT CAUSE.** Audit finding **F2** ("gate engine diagnostics") was implemented fail-closed and
the gate is evaluated before anything else, but the operator surface was never given an identity:
`FREEBORN_ADMIN_EMAILS` is a Vercel var with `target: ["production","preview"]` and
`visibility: secret` — **no `development` target**, and I could not read its value. If it is
empty/unset in production, the route 404s for *every* caller including you. Net effect: the one
route that "exercises the SAME code path the moderation and verification flows use" answers no
one, so the F-A ladder stays unmeasured.

**FIX.** (1) Confirm the value is a real member email on this project: `vercel env pull` or the
dashboard; add `development` to the target list. (2) Prefer a distinct non-404 signal for the
unauthenticated case only if disclosure is acceptable — otherwise add a second, dead-simple
authenticated route that just prints `configured: boolean` for each engine so the gate can be
verified without triggering probes. (3) Log the probe result to `security_events` (table exists,
currently 0 rows) so an operator can read engine health without a browser session.

**BEFORE → AFTER.** Before: 404 with no way to tell "gate working" from "gate locked me out".
After: `{"engine1":{"configured":true,...}}` for you, 404 for strangers, and a stored history.

**LIVE TEST.** Run as a signed-in admin: `curl -H "Cookie: <sb cookie>" https://freeborn-umber.vercel.app/api/health/engines?fresh=1`
(`?fresh=1` clears the cached winner — without it you read the cache, not the config).

**REMAINING LIMITATION.** I did not create a session or a user in your production DB, so the
authenticated payload has never been observed. Unverified: whether `FREEBORN_ADMIN_EMAILS`
currently holds a usable address.

---

## F-C. `FREEBORN_ALLOWED_ORIGINS` contains a `*` wildcard that the matcher cannot honour

**FOUND.** Decrypted value (Vercel `get_env_var`, id `ntz3XZNtrw2Pad4q`):
```
https://freeborn-umber.vercel.app,https://*-spencerbby8-5225s-projects.vercel.app
```
`src/lib/request-guard.ts` tests it with exact set membership:
```ts
if (allowedOrigins().has(origin.replace(/\/$/, ""))) return true;
```

**ROOT CAUSE.** `allowedOrigins()` splits on commas and trims trailing slashes — there is no glob
or regex path. `Set.has()` compares literal strings, so the `*-spencerbby8-…` entry can never
equal any real origin: it is dead configuration. It looks like an active wildcard, which is the
danger: a future reader will believe preview URLs are covered and remove the fallback.
Second, related: the fallback *does* make every same-host request pass —
```ts
return new URL(request.url).origin === new URL(origin).origin;
```
so on `freeborn-umber.vercel.app` the guard accepts any origin equal to the request host and
accepts a **missing** Origin entirely (`if (!origin) return true`). That makes the CSRF layer
effectively permissive, which the file's own header calls "the second layer".

**FIX.** Delete the wildcard entry (it does nothing) or implement it honestly:
`origins.some(o => o.includes("*") ? new RegExp("^" + escapeRe(o).replace(/\\\*/g,"[^.]+") + "$").test(origin) : o === origin)`.
Then drop the host-comparison fallback or restrict it to `process.env.VERCEL_ENV !== "production"`,
so production security rests on the explicit list rather than on URL coincidence.

**BEFORE → AFTER.** Before: an allowlist entry that silently matches nothing plus a rule that
makes the allowlist moot. After: whatever the list says is what runs.

**LIVE TEST.** `curl -X POST https://freeborn-umber.vercel.app/api/likes -H "Origin: https://evil.example" -d '{}'`
expect 403; `curl -X POST … -H "Origin: https://abc-spencerbby8-5225s-projects.vercel.app"`
expect 403 today (proves the wildcard is dead) though it depends on `getMember` rejecting first.

**REMAINING LIMITATION.** I did not fire POSTs at production — an anonymous POST may 401 on the
auth check before the origin check and prove nothing. Unverified: which check answers first.

---

## F-D. 17 RLS-enabled tables have zero policies; RLS is not the boundary the app relies on

**FOUND.** Live query against `ihwtpwlszegrjgakqsxx`:
- `rls_DISABLED tables`: **none** (good — every public table has RLS on)
- `rls_ENABLED but no policy`: `accounts, appeals, chat_media, event_interests, matches,
  message_reactions, messages, mixer_venues, moderation_actions, realtime_health, reports,
  security_events, sessions, support_requests, suspensions, verification_requests, warnings` (17)
- `policies_total(public)` = **30** across **15** tables; `tables with RLS FORCED` = **none**
- roles: `postgres bypassrls=true canlogin=true`, `service_role bypassrls=true canlogin=false`,
  `anon bypassrls=false canlogin=false`, `authenticated bypassrls=false canlogin=false`

**ROOT CAUSE.** The app does not talk to Postgres as `anon`/`authenticated`. It connects through
`SUPABASE_TRANSACTION_POOLER` (set in Vercel, `postgres` user) → **`bypassrls=true`, so every
Drizzle query ignores RLS entirely**. The browser client (`src/lib/supabase/browser.ts`) never
queries tables — `grep` for `.from('messages'|'matches'|'sessions'|'accounts'|'reports'|'appeals'|'moderation_actions'|'security_events'|'chat_media'|'verification_requests')` across `src` → **0 hits**, and `.rpc(` → 0 hits. Realtime is broadcast-only
(`src/lib/call-bus.ts:64,70`, `call-listener.tsx:37` use `channel('fb-ring:…')`, no
`postgres_changes`). So the 17 policy-less tables are unreachable-by-design today.

**FIX.** Two coherent options — pick one and make the code agree with it:
1. Accept the architecture and say so: add a comment in `db/` recording that RLS is defence in
   depth only, and **lock the door** by revoking `anon`/`authenticated` table grants project-wide
   (already true for tables: `anon grants on public tables` = **0**).
2. Make RLS real for anything a browser could ever subscribe to: add `to authenticated` policies
   on `messages`, `matches`, `chat_media` before any `postgres_changes` subscription is added.
Either way add `force row level security` to the tables that do have policies — `FORCED` is
currently `none`, so a query issued as the table owner skips them silently.

**BEFORE → AFTER.** Before: a reader of `SECURITY.md` may believe RLS protects chat; it protects
nothing, because nothing runs as `authenticated`. After: the guard matches the mental model.

**LIVE TEST.** From the sandbox, as `postgres` I cannot exercise the `authenticated` role
(`canlogin=false`). Verifiable instead: `select count(*) from pg_policies where tablename='messages'` → 0.

**REMAINING LIMITATION.** Whether Supabase **Realtime RLS** is enforced for the broadcast channels
is not answerable from SQL; no policy-less-table subscription exists today, so no live impact.

---

## F-E. Verification's own retry loop is the one engine path with no budget at all

**FOUND.** `src/app/api/verification/check/route.ts` does **not** use `withBudget`
(`grep -c withBudget` → **0**). It hand-rolls `askGemini()` with `for (let attempt = 0; attempt < 3; attempt++)`,
a 20 s `AbortController` per attempt and `await new Promise(r => setTimeout(r, 700))` between
retries → up to **~62 s** of engine waiting, awaited directly in the handler
(`:238 const poseText = await askGemini([...])`), with `maxDuration = 120`.
It also builds its own `fetch` to `${BASE}/v1/chat/completions` with `max_tokens: 220`,
`temperature: 0` and **both** `Authorization: Bearer` and `x-api-key` headers — i.e. a second,
divergent copy of the engine call that the F2 rewrite explicitly set out to eliminate
("the previous version built its own fetch calls … the probe and the product were not even
testing the same request").

**ROOT CAUSE.** The F2 refactor unified `engine-request.ts` for moderation/identity-match but left
the selfie-pose route with its own transport and its own retry policy, and `ENGINE_BUDGET_MS`
protection was never applied there.

**FIX.** Replace `askGemini` with `callEngine(ENGINE_1_VISION, …, { images, maxTokens: 220 })`
and wrap in `withBudget(..., ENGINE_BUDGET_MS_VISION, …)` sized to the real platform cap. Keep the
`IMAGE_DROPPED_RE` retry, but move it inside `callEngine` so it becomes one ladder, not two.

**BEFORE → AFTER.** Before: a failing vision gateway makes the verify button hang up to ~120 s and
the health probe (which uses `maxTokens: 16` and a different header set) can report green while the
product is red. After: one transport, one budget, probe and product identical.

**LIVE TEST.** Needs an authenticated verification attempt — not run against production by me.

**REMAINING LIMITATION.** Unverified: whether `verification/route.ts` (the other half) shares the
problem. It imports no `callEngine`; its `maxDuration` is unset, which defaults to the plan cap.

---

## F-F. `profile-photos` bucket is still public, and calls ride a hardcoded third-party TURN relay

**FOUND.** Live: `storage.buckets` → `profile-photos = public:true | verification-selfies =
public:false | chat-media = public:false`. The F8 lockdown (`db/migrations/2026-10-27-audit-f1-f10.sql`)
flipped only `chat-media`. And `GET /api/calls/ice` (200, anonymous) returned, verbatim:
```json
{"iceServers":[{"urls":["stun:stun.l.google.com:19302", …]},{"urls":"stun:stun.nextcloud.com:443"},
{"urls":["turn:openrelay.metered.ca:80","turn:openrelay.metered.ca:443","turn:openrelay.metered.ca:3478"],
"username":"openrelayproject","credential":"openrelayproject"}],
"iceTransportPolicy":"all","bundlePolicy":"max-bundle","rtcpMuxPolicy":"require"}
```

**ROOT CAUSE.** `FREEBORN_TURN_URL/USER/CRED` are read by `src/app/api/calls/ice/route.ts` and are
**absent from Vercel** (project env list has 11 keys: `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_TRANSACTION_POOLER`, `NEXT_PUBLIC_APP_URL`, `VOID_AI_BASE_URL`, `VOID_AI_API_KEY`,
`ANTIGRAVITY_BASE_URL`, `ANTIGRAVITY_FREE_API_KEY`, `FREEBORN_ADMIN_EMAILS`, `FREEBORN_ALLOWED_ORIGINS`
— and team shared env is **empty**: `{"envs": []}`), so the code takes its documented fallback:
"Until then the community relay below keeps calls alive". That fallback is a public relay with
publicly-known credentials, handed to every anonymous visitor by an unauthenticated route.
Same class of absence for the trust layer: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is not in Vercel, and
`TURNSTILE_SECRET_KEY` is marked *"(planned trust layer, Phase 3)"* in `.env.example:61` — grep
across `src` shows the token is only consumed client-side
(`auth-experience.tsx:191 if (turnstileEnabled() && !captchaToken)`); **no server-side verification
exists**, so Turnstile today is a UI gate, not a control.

**FIX.** (1) Provision your own TURN (Cloudflare Calls / Twilio / coturn) and set the three vars;
delete the baked-in `openrelayproject` fallback so an unconfigured deployment fails the call
instead of silently relaying through a stranger's box. (2) Either implement the Phase-3 server
check (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify` before creating an account)
or delete the widget + the CSP allowance for `challenges.cloudflare.com` (`security-headers.ts:112`)
so the docs stop implying a bot defence that isn't enforced. (3) For `profile-photos`: decide
explicitly — public bucket + guessable object names is the one remaining bulk-photo exposure; if
public is intended, store non-enumerable keys and set `public:false` with a signed URL route like
`/api/chat/media/[id]` already does.

**BEFORE → AFTER.** Before: calls work only as far as a free shared relay carries them, and mobile
CGNAT (the exact case the file's comment raises) is the first thing that breaks; bot signups pass.
After: calls break loudly until TURN is provisioned, and either bot gating exists or the claim is removed.

**LIVE TEST.** `curl -s https://freeborn-umber.vercel.app/api/calls/ice` (done — above). For the
fix, re-run and assert the openrelay entry is gone:
`curl -s …/api/calls/ice | grep -c openrelay` → expect `0`.

**REMAINING LIMITATION.** I never placed a call, so "calls fail on mobile" is a code-and-config
inference (absent TURN vars + documented fallback), **not** an observed call failure.

---

## F-G. `GET /api/calls/trace` is anonymous and instance-global

**FOUND.** `src/app/api/calls/trace/route.ts` has no `getMember` call (guard census: `guards=0`)
and its GET is:
```ts
const entries = callId ? buffer.filter(e => e.callId === callId) : buffer.slice(-200);
```
against a module-level `const buffer: TraceEntry[] = []` capped at `MAX = 600`.
Live: `curl https://freeborn-umber.vercel.app/api/calls/trace` → `{"entries":[]}` HTTP **200**, i.e.
reachable and readable with no session.

**ROOT CAUSE.** It was written as an ephemeral debugging black box ("In-memory, capped, no personal
data beyond the call id and role") and shipped as-is. Two consequences: any anonymous visitor can
read the last 200 signalling events of whoever happens to share the lambda instance, and can append
to that shared buffer with cheap POSTs (`{callId, event}` only are required). Because the buffer is
per-instance and serverless instances recycle, the "after a failed call the trace shows exactly
where it died" promise also silently fails in production.

**FIX.** Require the same member the call belongs to (`getMember(request)` + filter `callId`s owned
by that member), key the buffer by `callId` instead of a global array, and cap writes per session.
If it must stay anonymous for support, move it out of production entirely (return 404 when
`NODE_ENV === "production"`, exactly like `debug/auth` and `debug/setcookie` already do).

**BEFORE → AFTER.** Before: `{"entries":[…]}` to anyone. After: only the participant sees their own trace.

**LIVE TEST.** `curl -s -o /dev/null -w "%{http_code}" https://freeborn-umber.vercel.app/api/calls/trace` → 200 now,
expect 404 (or 401) after the fix.

**REMAINING LIMITATION.** Empty at test time, so no user data was actually observed; the leak is
proven structurally (code path + 200 + no auth), not by example.

---

## F-H. Cross-checks that came back clean (so the list above is trustworthy)

- **The F1–F10 migration really is applied.** Live vs `db/migrations/2026-10-27-audit-f1-f10.sql`:
  `profile_with_photos = security_invoker=true` (F1); `pg_stat_statements` in schema `extensions`
  (F3); `policies granting public or anon` = **0** and `anon grants on public tables` = **0** (F4);
  `discover_candidates(uuid,integer,integer)` grantees = `postgres, service_role` (F5);
  `chat-media = public:false` (F8); `realtime_health` present in `supabase_realtime` publication and
  table exists (F10).
- **Repo gates pass locally on `fda146e`:** `npm run check:secrets` → "secret scan OK — 231 tracked
  files scanned"; `npm run typecheck` (tsc 5.9.3) → no output, 0 errors; `npm run lint` (eslint 9.39.4)
  → no findings; `npx next build` → succeeded, 37 API routes + middleware proxy emitted.
  `node_modules` 705 MB.
- **Debug routes are production-guarded in code** (`debug/auth`, `debug/setcookie` both return 404 when
  `NODE_ENV === "production"`). I checked before claiming, because my first read of the 404 on
  `/api/health/engines` was wrong: I initially suspected a stale deploy and the deployment metadata
  disproved it.
- **`NEXT_PUBLIC_APP_URL` matches reality**: `https://freeborn-umber.vercel.app` — consistent with the
  production alias, so the auth-exchange / OAuth redirect origin cannot drift on the main domain.
- **DB is not yet in production use**: `accounts` 3, `user_profiles` 8, `matches` 1, `messages` 16,
  `verification_requests` 8, `reports` 2, `appeals` 0, `sessions` **0**, `security_events` **0**.
  Two dead-ish tables: `sessions` (0 rows while `/api/account` exposes a sessions control) and
  `security_events` (0 rows although F-A's fix would want it as the audit sink).
- **`rea` audit trail**: `analyze` parsed **24 181** files when pointed at `freeborn-original`
  (it happily walked `node_modules`/`.next` — use `--exclude` or run on a clean checkout).

---

## F-I. Things I could not verify — stated plainly

1. Engine key **values** and therefore whether engine1/engine2 actually answer (`sensitive` type hides them; Vercel API returns `"value":""` for both set and unset).
2. `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` values (encrypted, and a publishable key is public by design — I deliberately did not pull the pooler password into this file).
3. F9's claims (nonce CSP, HttpOnly+Lax cookies, 12-char password + HIBP, redirect allowlist): the F2/F9 code paths were only partially read; **not audited end-to-end**.
4. `profile_with_photos` view's actual SELECT shape vs `src/db/schema.ts` — schema-vs-live column diff not run.
5. Supabase **edge functions**, **auth config** (signup/email-confirm), and **migration history** — not listed this session.
6. Whether PR #24 (`arena/security-hardening`, author `arena-agent`, created 2026-10-27T21:52:10,
   base `main`, **state: open, merged: False, mergeable_state: clean**) is still wanted — the
   `arena-agent` commit `24b8abb` previewed at `freeborn-25yypygjs-…` is **not** in `main`;
   your `fda146e` re-implemented the F1/F2/F5/F7 items. Diff it before closing, or those
   preview-deploy-only fixes are lost. `gitRepoVisibility: public` is recorded on both deployments.
7. There is no `test` script in `package.json` and CI (`.github/workflows/ci.yml`) runs only
   `check:secrets` → `typecheck` → `lint` → `next build`. `playwright@^1.63.0` and
   `scripts/seven-screens-evidence.mjs` exist but are **not gated in CI**. Unverified: whether those
   scripts still run.

---

## REA (morluto/rea) — installed and live-tested

**Identity, checked before installing anything.** Upstream `morluto/rea`: created 2026-04-14, pushed
2026-10-28T16:31:44Z, **401 202** stars / **100 614** forks / 1 474 open issues, MIT, homepage
`rea.tools`, default branch `main`, npm `rea-agents` **6.8.0** by maintainer `morluto`, 34 versions
since 2026-07-12. Your `spencerbby8-gif/rea` is a fork (`fork: true`, parent `morluto/rea`) sitting at
`a174892e` (2026-10-25) — **3 days behind upstream**. `install.sh` opens with a deliberate truncation
guard (brace group so a cut-off download fails at parse time) which is a good sign of care, but note the
GitHub search also shows a swarm of near-identical `*/rea` mirrors with 0–3 stars — install only from
`morluto/rea`, `rea.tools` or the `rea-agents` npm package, as the README's own IMPORTANT block says.

**What I did**
```
Node 24 needed: installer hard-failed → "REA installation failed: Node.js 20.20.2 is unsupported"
  (package.json engines: ^22.23.4 || ^24.22.1 || >=26.12.1)
fetched nodejs.org/dist v24.22.1 linux-x64 (32 026 916 B) -> /home/user/.local/node24   (node -v = v24.22.1)
npm install -g --prefix /home/user/.local/rea rea-agents@6.8.0     -> added 176 packages in 14 s
rea --version                                                       -> 6.8.0
```
Chose the pinned npm package over `bash install.sh` and over running `rea setup`, because `setup` is
an interactive agent-integration wizard (writes MCP registrations into other tools' configs) — that
should be your decision, not a side effect of my turn.

**`rea doctor` (official readiness check), verbatim outcome:** `healthy: false`, `environment_healthy: false`.
`node` ok (24.22.1), `host` ok (debian 13). Missing **analysis engines**, all of them external and
caller-supplied: `hopper` (`missing_analysis_engine`, "Run rea setup to install Hopper, or set
HOPPER_LAUNCHER_PATH"), `ghidra` ("GHIDRA_INSTALL_DIR is not set" → needs an extracted Ghidra 12.1.x),
`ida-registration` (`REA_IDA_MCP_CONFIG`), `jadx` (`REA_JADX_MCP_JAR`, "REA does not download or install it"), `kuna-installation`.
`frida@17.23.2` is an **optional** dep whose install script npm blocked (`install-scripts … frida@17.23.2 (install: node scripts/install.js)`)
— so runtime/dynamic instrumentation is **not** active. My `--allow-scripts=frida` retry produced no
change, so treat frida as uninstalled.

**Works today (tested, not assumed):** the static JS path. `rea analyze /home/user/freeborn-original --json`
emitted real progress phases and parsed 24 181 files with exit 0. Binary/native paths are inert until a
Ghidra/Hopper install is pointed at it.

**To finish setup when you want it**
```sh
export PATH=/home/user/.local/node24/bin:/home/user/.local/rea/bin:$PATH
rea setup                      # agent/MCP integrations + providers (interactive)
# or headless, per README:
npx -y rea-agents@latest analyze-javascript-application /abs/path --json
npm install -g --prefix ~/.local/rea --allow-scripts=frida rea-agents@6.8.0   # for frida-based runtime tracing
```
Reality check for this sandbox: `~/.local` is in the snapshot-exclusion list, so **Node 24 and the REA
install do not survive sandbox resets** — rerun the two commands above after a wipe. Ghidra also needs a
JDK and a ~700 MB download; this box has 19 GB free (5.2 GB used), so it fits but it is your call.

---

## Suggested order of work

1. F-A + F-E together (budget vs ladder vs platform cap) — this is the user-visible slowness/hang class.
2. F-B (make the engine probe reachable once, read it, then decide whether to keep the gate at 404 or move it behind a logged route).
3. F-F TURN + Turnstile decision (both are "documented but not wired" and both are cheap).
4. F-C (one-line matcher fix; do it before someone trusts the wildcard).
5. F-G (auth on trace), then F-D (decide the RLS story, add `force row level security`).
6. Close or merge PR #24 so `arena/security-hardening` stops drifting.
7. Optional: `rea setup` + Ghidra if native-binary work is actually on the roadmap.

---

## F-H. Supabase-side hardening the repo already asks for was never applied (and signup is browser-enforced only)

**FOUND.** `supabase__get_auth_config` on `ihwtpwlszegrjgakqsxx`, live values:

| Setting | Live value | What the repo/docs say |
|---|---|---|
| `password_min_length` | **6** | `src/lib/password.ts:22` `MIN_PASSWORD_LENGTH = 12`; file comment: *"has to be raised to 12 in the Supabase dashboard"* |
| `password_hibp_enabled` | **false** | `SECURITY.md:53-55` "To enforce server-side, enable `password_min_length=12` and `password_hibp_enabled=true`" |
| `security_captcha_enabled` | **false** (`provider: "hcaptcha"`, `secret: null`) | `SECURITY.md:56` "CAPTCHA remains off: no Turnstile site/secret key was provided" |
| `disable_signup` | **false** | GoTrue signup is wide open to direct API callers |
| `smtp_host` / `smtp_user` / `smtp_pass` / `smtp_admin_email` | **all null** with `mailer_autoconfirm: false` | confirmation emails cannot be delivered → a fresh signup has no session and no link |
| `site_url` | `https://freeborn-umber.vercel.app` | ✅ correct, matches the Vercel alias and `NEXT_PUBLIC_APP_URL` |
| `uri_allow_list` | `…freeborn-umber.vercel.app/**, https://*-spencerbby8-5225s-projects.vercel.app/**, http://localhost:3000/**` | wildcard here **is** honoured (path glob), unlike the app's own exact-match list (F-C) |
| `jwt_exp` | 3600 | — |
| `audit_log_disable_postgres` | **true** | GoTrue's own Postgres audit log is off, and `security_events` has 0 rows → no server-side trail of auth events |

**ROOT CAUSE.** `signUp` is called **directly from the browser** —
`auth-experience.tsx:234 supabase.auth.signUp({email, password, options:{emailRedirectTo, captchaToken}})` —
so the only password gate on that path is the client component (`:172 if (values.password.length < MIN_PASSWORD_LENGTH)`,
`:201 const pwned = await isPwnedPassword(values.password)`). Anyone hitting
`POST /auth/v1/signup` with the publishable key is bound by GoTrue's policy, which is **6 chars, no
HIBP, no captcha**. And the client check itself is fail-open: `:202 if (pwned === true)` — when the
`api.pwnedpasswords.com/range/…` lookup errors and returns `null`, signup proceeds with a pwned password.
`captchaToken` is already passed to `signUp`, so enabling `security_captcha_enabled` with a Turnstile
secret needs **no code change at all**.

**FIX.** In the Supabase auth config (I can apply it with the connector if you say go):
`password_min_length=12`, `password_hibp_enabled=true`, `security_captcha_enabled=true` +
`provider=turnstile` + secret, `smtp_*` set (or accept that unconfirmed accounts are unusable),
and turn `audit_log_disable_postgres` off or start writing `security_events` from the auth routes.
Code-side: make `isPwnedPassword` fail **closed** (`if (pwned !== false) block`) or move the check to
a server route, and stop trusting a browser-only length rule — revalidate in
`/api/auth/callback-exchange` (currently 0 rate-limit rules there either).

**BEFORE → AFTER.** Before: `hunter2` (7 chars, pwned) is accepted via a 1-line curl; nothing rate-limits
it; no email can arrive. After: 12-char + HIBP + Turnstile enforced by the server that actually mints
the credential, and an audit trail exists.

**LIVE TEST.** I did not run it (creating a user in your production DB is a write). Reproduce with:
`curl -X POST https://ihwtpwlszegrjgakqsxx.supabase.co/auth/v1/signup -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{"email":"probe@example.com","password":"short"}'`
→ expect 200 today, `422 password should be at least 12 characters` after the change.

**REMAINING LIMITATION.** Unverified: whether mail delivery is actually broken (SMTP may be configured
elsewhere in the dashboard beyond these keys), and whether your 3 existing `accounts` rows are confirmed
(`mailer_autoconfirm:false`).

---

## F-I (revised). Migration history confirms the audit record — one item to re-check

`supabase__list_migrations` → 19 migrations, newest five:
`20261027233915 revoke_anon_pg_stat_statements`, `20261028002705 f1_f5_postgrest_lockdown`,
`20261028002725 f8_chat_media_private`, `20261028002740 f10_realtime_publication`,
`20261028002928 f1_f5_cleanup_default_privileges`.
So the DB lockdown was applied at 2026-10-28 00:27–00:29 and the recording file
`db/migrations/2026-10-27-audit-f1-f10.sql` was committed at 00:52 — i.e. applied first, documented
after, which matches the file's own "the source of truth is the live database" claim. **Verified true.**
One caveat: `alter default privileges` (F4's last-resort hygiene) only affects objects created *after*
it ran, so any table created before 00:29 keeps its old grants. `anon` grants on `public` are 0 today,
so nothing is exposed — but re-check after every future `CREATE TABLE`.

Also closed from the earlier "could not verify" list: **no edge functions exist** (`{"items": []}`), so
nothing hides server logic outside Next.js — the whole trust boundary really is the 37 API routes.

## Suggested order of work (updated)

1. **F-H config** — highest value per minute: 3 toggles in Supabase + SMTP, no code change for captcha.
2. F-A + F-E (budget vs ladder vs platform cap) — the user-visible hang/slow class.
3. F-B (make the engine probe reachable once, read it, then decide if the 404 gate stays).
4. F-F TURN provisioning + decide `profile-photos` public:true.
5. F-C (one-line matcher fix) and F-G (auth on `/api/calls/trace`).
6. F-D (pick the RLS story, add `force row level security`).
7. Close or merge PR #24 so `arena/security-hardening` stops drifting; wire `seven-screens-evidence.mjs` + Playwright into CI (no `test` script exists).
8. Optional: `rea setup` + Ghidra if native-binary work is on the roadmap.

---

# EXECUTION LOG 2026-10-28 — password policy change attempt

## Result: NOT APPLIED. Blocked by tooling, not by the project.

**The instruction was** to set `password_min_length=12` + `password_hibp_enabled=true`, hold CAPTCHA,
and prove before/after. The **before** state was measured; the change could not be made.

**Why it could not be made (verbatim tool error):**
```
supabase__update_auth_config → Invalid input for tool: An unsupported property was sent.
Allowed properties: disable_signup, external_email_enabled, external_phone_enabled, jwt_exp,
mailer_autoconfirm, project_ref, security_refresh_token_reuse_interval,
security_refresh_token_rotation_enabled, site_url, sms_autoconfirm, uri_allow_list.
```
`password_min_length` and `password_hibp_enabled` are **not** in the connector's accepted set, although
Supabase's own reference lists both as valid bodies for
`PATCH /v1/projects/{ref}/config/auth` [1](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
So this is a connector limitation, not a Supabase rejection. No other path exists from here: the
Supabase CLI and `api.supabase.com` both need a `sbp_` management token, which is not in this session
(the two GitHub PATs are GitHub-only and both 401), and there is no Cloudflare/dashboard connector.

**A second, independent risk to the HIBP half:** leaked-password protection is reported as
**Pro-plan and above**, with Free plans getting `402 Payment Required` from the same PATCH
[2](https://www.guardlayer.io/blog/supabase-leaked-password-protection)
[3](https://github.com/jormedp-glitch/gestionpro/issues/195).
I could **not** determine this project's plan from the connector: `get_project` returns
name/organization_id/region/status/database only, and `list_organizations` returns
`{id, name, slug}` — **no plan field**. So: plan unknown, Pro-dependence unverified.

## Config BEFORE (read twice — after the failed call too, proving nothing was changed)
`ihwtpwlszegrjgakqsxx`, `get_auth_config`:
| key | value |
|---|---|
| `password_min_length` | **6** (unchanged after attempt) |
| `password_hibp_enabled` | **false** (unchanged after attempt) |
| `password_required_characters` | null |
| `disable_signup` | false |
| `security_captcha_enabled` | false · `security_captcha_provider: "hcaptcha"` · `security_captcha_secret: null` |
| `rate_limit_email_sent` | 2 |
| `smtp_host/user/pass/admin_email` | all null |
| `audit_log_disable_postgres` | true |

## Test evidence BEFORE (direct API, publishable key pulled from the live bundle)
Key provenance: `https://freeborn-umber.vercel.app/auth` → chunk scripts → `all.js` (847 773 B) →
`sb_publishable_7N1q-Cn…`, **46 bytes**, sha256[:12] `a55b581b26f9`; cross-checked against
`list_api_keys` → `default` publishable, prefix `sb_publishable_7N1q-`, **the key the browser already has**.

| # | test | expectation before change | observed |
|---|---|---|---|
| 1 | control, 20-char unique password | accepted | **HTTP 200**, `id 6e01e989-95b2-489c-bb52-4b929d489d70`, `confirmation_sent_at 2026-10-28T17:02:44Z` |
| 2 | **8-char** password (`Ab1z9rb1`, i.e. ≥6 but < 12) | accepted today → proves the 12-char claim is browser-only | **HTTP 200**, `id fd7bca1c-aa68-4a4e-83f8-a31e4894942d` |
| 3 | pwned password, 22 chars | undetermined | **HTTP 429** `over_email_send_rate_limit` (because `rate_limit_email_sent=2`) — **never reached password validation, so HIBP was not tested** |

Side-effect accounting, disclosed and undone: test 1 + 2 created 2 rows in `auth.users`
(8 → 10). Neither appeared in `public.accounts` (`accounts.email matches: none`; `accounts` 3 rows /
0 confirmed; 0 rows have `encrypted_password` — that scrypt column is entirely unused, so GoTrue is the
only credential store and there is **no app server route** where a length/HIBP check could live:
`grep signUp|admin.|createUser src/app/api` → no hits). Cleanup `delete from auth.users where id in (…)`:
`remaining 8`, `my_test_rows_left 0`. Test 3 was rate-limited so no row was created.
No password was written to any file; key material stayed in `/tmp/fb` (not snapshotted).

## AFTER
Unchanged, by design — nothing was applied. Re-read after the attempt: `password_min_length: 6`,
`password_hibp_enabled: false`.

## CAPTCHA: verification completed, still held
- **Widget on the deployed frontend:** `grep -c "cf-turnstile" page.html` → **0**. The rendered `/auth`
  page contains no widget host. `turnstile.tsx` ends with `if (!SITE_KEY) return null;` and
  `SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""`, which is **absent from Vercel**.
  The `challenges.cloudflare.com/turnstile/v0/api.js` string inside the JS bundle is dead code — the
  `useEffect` returns at `if (!SITE_KEY) return;` before it ever creates the script tag.
  **Conclusion: today CAPTCHA is a zero-effect path; enabling it cannot break signup.**
- **Does signup work today:** yes — `signUp` succeeds with no captcha at all
  (`options: {...(captchaToken ? { captchaToken } : {})}` and `security_captcha_enabled=false`).
- **Provider/secret matching, checked rather than assumed:** GoTrue supports exactly `hcaptcha` and
  `turnstile`; the config file documents *"Configure one of the supported captcha providers:
  `hcaptcha`, `turnstile`"* [4](https://github.com/orgs/supabase/discussions/20816), and Supabase's own
  guide: "Supabase authentication has support for hCaptcha and Cloudflare Turnstile"
  [5](https://supabase.com/docs/guides/auth/auth-captcha). Current stored value is `hcaptcha` with
  `secret: null`, so the site key on the Vercel side must be created for the same provider and the
  widget's hostname allowlist must include `freeborn-umber.vercel.app` **and** the
  `*-spencerbby8-5225s-projects.vercel.app` preview hosts.
- **Blocked on:** credentials. I can neither read nor create a Turnstile widget — there is no Cloudflare
  connector in this session, and Cloudflare's always-pass test keys bind only to `localhost`/`127.0.0.1`,
  so they cannot produce a *valid* token for the deployed domain [4](https://github.com/orgs/supabase/discussions/20816).
  Hence "test valid vs invalid token" is impossible without your keys, and I am not claiming otherwise.

## To finish this, either
1. Run it yourself in the Dashboard (Authentication → Sign In / Providers → Email) or:
```bash
curl -X PATCH "https://api.supabase.com/v1/projects/ihwtpwlszegrjgakqsxx/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"password_min_length":12,"password_hibp_enabled":true}'
```
   Then tell me and I will run the full before/after matrix (short pw → expect 422, pwned 22-char pw →
   expect rejection, valid 20-char → expect 200) and clean up after myself.
2. Paste a `sbp_`-scoped management token (read-config + write-config only) and I will apply and verify in
   this session. It is chat-transmitted, so rotate it afterwards. A Cloudflare Turnstile sitekey+secret
   for both hostnames unblocks the CAPTCHA branch, including the valid/invalid token tests.

Plan note for option 1: if the org is on Free, `password_hibp_enabled` may be refused — verify plan first;
`password_min_length=12` is not plan-gated per the same sources.

---

# PLAN VERDICT + DASHBOARD RUNBOOK + F-C PATCH EVIDENCE (2026-10-28, second pass)

## 1. Is HIBP supported on your plan? — answered as far as evidence allows

**Authoritative, from Supabase's own docs, fetched this pass**
(`supabase.com/docs/guides/auth/password-security`): *"Leaked password protection is available on the
Pro Plan and above."* So **`password_hibp_enabled=true` is plan-gated**; `password_min_length` is not.

**What your plan actually is: I could not read it from here — say so, don't guess.**
`get_project` returns only `name/organization_id/region/status/database`, `list_organizations` only
`{id, name, slug}`; there is no billing endpoint in the connector. **No working GitHub token either**
(the two PATs you pasted both 401 and were shredded), so no API route to `api.supabase.com`.

One **supporting, non-conclusive** signal, measured: the published Free plan states *"Free projects are
paused after 1 week of inactivity. Limit of 2 active projects"* [pricing page]. Your org holds 3 projects —
`Freeborn` = `ACTIVE_HEALTHY`, `AbegHelpMe` = inactive, `ReplyMate` = inactive — i.e. **1 active of 3**,
which is consistent with Free and impossible to distinguish from "paid, two projects left idle".
**Verdict to act on: assume Pro is required; confirm in the dashboard in 10 seconds (step A below).**
If it reads Free, `password_min_length=12` is still applicable and HIBP needs a plan change —
I will not mark HIBP as enabled in that case.

## 2. Exact Dashboard steps for everything my connector cannot apply

**A. Plan + password policy** (this is the whole 12-char + HIBP change)
1. `https://supabase.com/dashboard` → org `spencerbby8@gmail.com's Org` → **Billing / Plan** — read the
   plan label. HIBP requires **Pro or above**.
2. `https://supabase.com/dashboard/project/ihwtpwlszegrjgakqsxx/auth/providers` → open the **Email** provider panel.
3. **Minimum password length** → `12`. (Docs: "Anything less than 8 characters is not recommended".)
4. **Password requirements** → optional; strongest is digits + lower + upper + symbols. Your own
   `src/lib/password.ts` only enforces length, so choosing complexity here would make GoTrue stricter
   than the app's message — pick deliberately, not by default.
5. **Prevent use of leaked passwords** → ON. On Free this switch is disabled/greyed; that is the plan
   gate, not a bug in this list.
6. Save, then **re-read** to confirm persistence: the same panel, or
   `GET /v1/projects/ihwtpwlszegrjgakqsxx/config/auth` → expect `password_min_length: 12`,
   `password_hibp_enabled: true`.
7. **Expected side effect on existing users** (from the docs FAQ): accounts whose current password is now
   too short can still sign in, but a change attempt returns `WeakPasswordError`. You have **8 rows in
   `auth.users`** and **3 in `public.accounts`**, so the blast radius is ~8 accounts, not thousands.

**B. Email delivery — currently impossible, and it blocks signup completion**
`smtp_host/user/pass/admin_email` are all `null` while `mailer_autoconfirm: false`. Until SMTP is set, a
new member never receives the confirmation link, and `rate_limit_email_sent: 2` throttles attempts to
2/minute (measured: my third test returned `429 over_email_send_rate_limit`).
Dashboard → project → **Settings → Logs & Analytics / SMTP** → enter host/port/user/pass/admin email
(port 587, STARTTLS), then **Send test email**. Note Supabase's built-in sender is rate-limited and is not
a production option.

**C. Two more one-line toggles worth taking while you are in Settings**
- **Auth → Advanced → `audit_log_disable_postgres`** → OFF (currently `true`), or start writing
  `public.security_events` from the auth routes — it has **0 rows**, so today there is no server-side
  trail of sign-ins at all.
- **Auth → Rate limits → `rate_limit_anonymous_users`** = 30/min (fine), and decide `jwt_exp` (3600 s)
  against your "sessions persist in phone storage" requirement.

**D. CAPTCHA — deliberately left OFF, as instructed. Nothing to click yet.**
Blocked on you for exactly one reason: there is no Turnstile widget to point at. Pre-conditions, all
verified as **not** met today:
| pre-condition | measured state |
|---|---|
| frontend widget rendered | `grep -c "cf-turnstile"` on the deployed `/auth` HTML → **0**; `turnstile.tsx` ends `if (!SITE_KEY) return null`, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is absent from Vercel |
| provider matches the widget | GoTrue stores `security_captcha_provider: "hcaptcha"`, `secret: null`; GoTrue supports only `hcaptcha` \| `turnstile` |
| secret configured | `security_captcha_secret: null` |
| production signup test | never run with a token; signup works today with no captcha (proven: HTTP 200 on direct `signUp`) |
When a Cloudflare widget exists for `freeborn-umber.vercel.app` **and** `*-spencerbby8-5225s-projects.vercel.app`,
the sequence is: create widget (Managed mode) → set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel (all three
targets) → Supabase Auth → Providers → CAPTCHA: enable, provider `turnstile`, paste the **secret** (Supabase
side only, never a `NEXT_PUBLIC_*` var) → redeploy → then the four tests: valid token signs up, garbage
token is rejected, missing token is rejected, and sign-in with a token still works. **Not fixed until those
four are green.** No secret ever needs to pass through this chat.

## 3. F-C — patched in the working copy, with before/after proof

`src/lib/request-guard.ts`, 21 insertions / 3 deletions: `matchesOrigin()` honours one `*` per entry
(escape-then-substitute, so config text cannot inject regex), `allowedOrigins()` returns an array,
`isSameOrigin` uses `.some(matchesOrigin)`. Harness drives the **real module** through
`esbuild --bundle` (esbuild 0.28.2 pinned by the repo's own `overrides`) — not a re-implementation.

| origin under test | HEAD (unpatched) | patched |
|---|---|---|
| `https://freeborn-umber.vercel.app` (canonical) | allowed | allowed |
| `https://abc123-spencerbby8-5225s-projects.vercel.app` (preview, via `*`) | **blocked ← the bug** | **allowed ← fixed** |
| `https://evil.example` | blocked | blocked |
| `https://freeborn-umber.vercel.app.evil.example` (lookalike) | blocked | blocked |
| trailing-slash variant | allowed | allowed |
| no `Origin` header (native app) | allowed | allowed |
Harness result: **5/7 → 6/7**, the single remaining FAIL (`https://x.freeborn-umber.vercel.app`) present in
**both** columns — pre-existing, not introduced here (verified by running that case against both builds:
`blocked=true` for each).

**Gates after the patch:** `tsc --noEmit` exit 0, `eslint .` exit 0, `check:secrets` exit 0,
`next build` exit 0 ("Compiled successfully in 8.8 s", 55 route rows).

**Honest limits on this fix — it does not close F-C's risk:**
1. `FREEBORN_ALLOWED_ORIGINS` is read at **runtime**, so the patched behaviour is live only once this
   patch is deployed. Uncommitted: `git status` → `M src/lib/request-guard.ts`. I cannot push (no working
   GitHub token), so **deployment is yours**.
2. Only **8 of 36** routes call `rejectCrossOrigin`; **16 mutating routes have no guard at all**
   (census this pass: `appeals, chat/start, events/interest, heartbeat, location, profile/me, reports,
   settings, support, verification, verification/check, security/check, notifications, onboarding,
   onboarding/complete, auth/callback-exchange, calls/trace, calls/ice`).
3. Worse, in **all 8 guarded routes the guard runs *after* the auth check**
   (`guardLine` vs `authLine`: 42 vs 40, 18 vs 16, 23 vs 21, 53 vs 51 …). Ordering does not change the
   CSRF outcome for a signed-in victim, but it means an attacker learns "this route exists and takes
   credentials" from the 401/403 split. A single call in `updateSession` (`src/lib/supabase/proxy.ts`,
   the middleware) would cover all 36 — deliberately **not** done, because middleware is the one place a
   wrong rule breaks every request, and `FREEBORN_ALLOW_CROSS_SITE_COOKIES=1` + `SameSite=None` in
   non-production is what makes a blanket rule safe or unsafe.
4. Production exploitability stays **contained by the cookie, not the guard**: `COOKIE_SAME_SITE = "lax"`
   when `NODE_ENV==="production" && FREEBORN_ALLOW_CROSS_SITE_COOKIES!=="1"` — and that var is **absent**
   from Vercel, so prod is Lax and cross-site POSTs carry no session. Previews run `None`
   (`NODE_ENV==="development"`), so the 16 unguarded routes are the ones that matter on preview URLs.

## 4. Still open, unchanged
F-A (ladder 3×3 rungs × 35 s vs `ENGINE_BUDGET_MS=20_000` and the Netlify-26s comment), F-B (engine probe
unreachable, `FREEBORN_ADMIN_EMAILS` not in the development target), F-E (verification has no budget:
`grep -c withBudget` → 0), F-F (openrelay TURN served to anonymous callers; `profile-photos` bucket
`public:true`), F-G (`GET /api/calls/trace` anonymous, live HTTP 200), F-D (see below), PR #24 unmerged,
no `test` script in CI.

**F-D numbers, re-measured this pass:** public tables **32 / RLS on 32 / FORCE on 0 / with policies 15**;
the 15 member-facing tables needing `FORCE ROW LEVEL SECURITY` are `blocked_users, discovery_preferences,
match_messages, notification_preferences, profile_photos, user_matches, user_private_locations,
user_private_settings, user_profiles, user_swipes, user_trust_history, verification_audit_logs,
verification_challenges, verification_rate_limits, verification_selfie_checks`. Policy commands:
`SELECT=10 ALL=8 INSERT=7 UPDATE=5`; policy roles in use: `authenticated, public` — note `public` still
appears in the role list even though F4's loop claimed to rewrite them to `authenticated`
(unverified which table; `policies granting public or anon` was 0, so these are `public`-role *policies*
on tables `anon` cannot reach — worth one query before closing F4).

---

# FIX PASS 2026-10-28 (third) — patch `ce34772`, everything measured

## Constraints honoured
- **PAT:** one probe only, as instructed. 40 bytes, `GET /user` → **401 Bad credentials**. Not retried,
  not stored, file shredded. **Nothing in this pass is pushed or deployed by me.**
- **`freeborn-web`** and any other project: not listed, not read, not modified.
- **Secrets:** none requested, none pasted anywhere, none written into the workspace. The publishable key
  used for testing was read back out of the live browser bundle (it is already public). The `sb_secret_…`
  value returned by `list_api_keys` is not reproduced here.

## Patch
`ce34772 Fix FREEBORN audit findings F-A..F-G + RLS hardening (2026-10-28)` — 12 files, +365/−65.
Artifacts in the repo root: **`FREEBORN-AUDIT2-PATCH.patch`** (32 183 B) and
**`FREEBORN-AUDIT2-PATCH.bundle`** (14 541 B, `HEAD --not fda146e`).
Apply: `git bundle unbundle` / `git am FREEBORN-AUDIT2-PATCH.patch`, then `git push` and let Vercel build.

## Evidence per finding

| # | Fix | Measured result |
|---|---|---|
| F-C | `matchesOrigin()` honours `*` in the allowlist | real module via esbuild harness: **5/7 → 6/7**; preview origin `blocked → allowed`; lookalike suffix stays `blocked` |
| F-C/F-D | guard moved into `src/middleware.ts` (all non-GET) | live patched prod build: foreign-origin POST → **403** on `/api/settings`, `/api/profile/me`, `/api/verification`, `/api/reports`, `/api/appeals`, `/api/location`, `/api/support` (7 routes that had **no** guard); same-origin POST → 401 (reaches handler); GET from foreign site → not 403; subdomain-of-canonical → 403; preview wildcard → 401 |
| F-G | trace requires a member, per-member scoping, 40/call write cap | before: anonymous `GET /api/calls/trace` → **200** with the shared buffer. after: anonymous POST → **401**, anonymous GET → **401** `{"error":"Not signed in."}` |
| F-F | hardcoded openrelay fallback removed; `relayConfigured` flag; half-config logs; `private, no-store` | `openrelay referenced: False`, `credential present: False`, `iceServers: 2` (STUN only), `cache-control: private, no-store`. Consumer contract checked first: `getIceConfig()` accepts any non-empty `iceServers`, so no client change needed |
| F-A | `budgetMs` on `EngineTarget`; ladder stops at `budget−1.5s`; 35s/20s hand-set aborts replaced by budget-derived 6.17s | server that accepts and never answers: **BEFORE-shaped call did not return in 75 s**; **AFTER-shaped returned in 18.5 s**, `ok=false`, `attempts=4`, last error `"ladder deadline 18500ms reached; 6 attempt(s) not tried"` |
| F-E | verification's own retry loop bounded by `ENGINE_BUDGET_MS`, retries 3 → 2 | `grep -c withBudget` was 0 on that route; now `ATTEMPT_TIMEOUT_MS = max(3000, (20000−1500)/3) = 6166`; worst-case engine wait 62 s → 13.03 s against `maxDuration=120` with `MIN_VERIFY_MS=14_000` still concurrent |
| F-B | production keeps fail-closed 404; non-production readable; every run written to `security_events` best-effort | dev server `GET /api/health/engines` → **HTTP 200 in 0.319 s** with full payload (`db:false`, `engine1.configured:false`, `engine2.configured:false`, `audit:"failed"` because the sandbox has no DB). Prod-mode build with no allowlist → **404**, unchanged |
| F-D | RLS review finished — see below | migration applied live; **forced 32/32**, `authenticated` grants **204 → 123**, `service_role` **231 intact**, `user_profiles=8 messages=16 verif=8 accounts=3 warnings=0 reports=2 appeals=0` unchanged, publication still `realtime_health` |
| preview cookie | `SameSite` defaults to `lax` everywhere; `none` only with `FREEBORN_ALLOW_CROSS_SITE_COOKIES=1` | constant evaluated from the real source lines: `env=unset → lax`, `"1" → none`, `"0" → lax`, `"true" → lax`. **Not observable live**: an unauthenticated request writes no `sb-*` cookie at all, and the debug probe sets its own pair — so this is source-verified + typechecked, not runtime-verified |

## RLS review — how it concluded (and why the obvious fix was rejected)
1. The intuitive fix, "add FORCE RLS so policies bind the owner", is safe here but **nearly
   pointless for the app**: `postgres` owns all 32 tables and holds `bypassrls=true`
   (`bypassrls=true super=false`), and BYPASSRLS outranks FORCE. A throwaway table proved it
   (`owner still sees rows (force had no effect)`).
2. So the real exposure was **grants**, and it was concrete: `authenticated` held
   `TRUNCATE`, `TRIGGER`, `REFERENCES` on every public table (204 grants). RLS blocked its SELECT
   (`set local role authenticated` → `messages readable … rows=0`), but TRUNCATE is not a
   row-scoped privilege in the same way, and none of the three is used by PostgREST or by this app.
3. Applied: FORCE on all 32 (cheap, closes future non-bypassing owners) **plus** revocation of the
   three unused privileges, including `alter default privileges` so new tables inherit the tighter set.
   Post-state re-measured above; privileged path (`service_role`, 231 grants, `bypassrls=true`) untouched.
4. `select 'policies whose roles include public'` → **NONE** — F4's rewrite to `authenticated` had
   already worked; the earlier `authenticated, public` string was `pg_policies.roles` display, not a gap.
5. Attempted live exploit test for TRUNCATE returned `"cannot TRUNCATE … being used by active queries
   in this session"` — inconclusive by construction, so I did **not** claim the hole was exploitable,
   only that the privilege existed and is now removed.

## Gates, after commit
`npm ci` 405 pkgs → `tsc --noEmit` **exit 0** · `eslint .` **exit 0** · `check:secrets` **exit 0**
("secret scan OK — 238 tracked files scanned") · `npx next build` **exit 0**
("Compiled successfully in 10.8 s", 55 route rows). Test servers all stopped; scratch logs deleted;
`git status` clean apart from this untracked doc and the two patch artifacts.

## Not fixed here — with the reason
- **CAPTCHA: still off, by instruction.** Pre-conditions re-measured: no widget in the deployed HTML
  (`cf-turnstile` count 0), GoTrue `provider=hcaptcha`, `secret=null`, no site key in Vercel. Left
  untouched so `turnstileEnabled()` stays false. I deliberately did **not** create an empty
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — an empty string keeps the flag off, so a placeholder would add
  nothing and could be mistaken for a configured key later.
- **`FREEBORN_TURN_*` provisioning**: needs a real relay (Cloudflare Calls/Twilio/coturn). The code no
  longer pretends otherwise; the operator config cannot be invented.
- **HIBP + 12-char minimum**: still blocked — the connector's `update_auth_config` schema excludes both
  fields, and the plan gate is unresolved (`get_project`/`list_organizations` expose no plan field).
  Dashboard steps are in the section above.
- **Live `security_events` insert**: `audit:"failed"` in the sandbox because there is no DB connection
  here; it degrades exactly as designed. Needs one production check after deploy.

## One config change I deliberately did NOT make
`FREEBORN_ADMIN_EMAILS` is `type: sensitive`, which means its value **cannot be read back** through the
API (`get_env_var` returns `""` for both set and unset). Re-targeting it to `development` would require an
`update_env_var` call, and a Vercel update that re-writes the record risks blanking a value I cannot
re-supply — the one variable that gates admin access to the engine diagnostics. Since commit `ce34772`
already makes non-production readable without an allowlist (F-B), that edit buys nothing it needs.
If you still want the development target, do it in the dashboard where you can retype the value, or tell
me explicitly and I'll attempt the target-only update knowing the risk.

---

# PASS 4 (2026-10-28) — profile-photos examined, and a self-correction

**I drafted `db/migrations/2026-10-28-profile-photos-private.sql` and deleted it before committing.**
Its stated safety premise — "0 `profile_photos` rows reference the bucket" — was **false**: I had
inferred it from `profile/photos/route.ts:170-181` (new uploads store bytes in `chat_media`), but the
live count is **7 of 11 rows** holding bare bucket paths
(`b9bc7ac1-…/1791425669828-9s95i…`). Flipping the bucket private on that basis would have blanked
seven members' photos across 8 read sites. Recorded here because the wrong claim was in a file, not
just in my head.

**What is actually true, measured:**
- `storage.buckets`: `profile-photos public:true`, `chat-media false`, `verification-selfies false`.
- `storage.objects`: `profile-photos` 8 objects, `chat-media` 2. One bucket object matches no row.
- A policy named **`Public read profile photos`** exists on `storage.objects` for role `public`,
  `cmd=SELECT`, `qual = (bucket_id = 'profile-photos')` — i.e. **anonymous read of the whole bucket is
  policy-backed**, not merely URL-guessability.
- Keys are `<member-uuid>/<epoch-ms>-<6 chars>.jpg`: unguessable, but the URL is the only secret, and it
  is handed to every visitor by `resolvePhotoUrl()` (`src/lib/photo-url.ts:22`), which is imported by 7
  routes (`profiles`, `profile/[id]`, `profile/me`, `likes`, `notifications`, `chat/matches`, `blocks`)
  plus `profile/photos/route.ts:188` and `onboarding-store.ts:104`.
- **Latent second bug:** `src/app/api/verification/check/route.ts:146` builds
  `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path}` — engine-side fetch of the member's
  own photo, i.e. a public URL is also constructed inside the server path.

**Why I am not "fixing" this in this pass:** every option is a product decision with visible
consequences, and a partial fix is worse than none.
1. *Private bucket + authenticated proxy* — breaks the identity-match engine, which fetches the photo by
   URL with a service credential, not a member session. Needs the engine to read storage via the admin API.
2. *Private + signed URLs* — breaks the public profile page for anonymous visitors (by design, the site
   promises members-only photos) and adds a URL-expiry UX problem.
3. *Owner-only policy + proxy* — stops other members seeing each other's photos: the core flow.
**Recommendation:** option 1 with the engine switched to `createAdminClient().storage.from(...).download()`,
plus a migration that drops the `public` SELECT policy and sets `public=false`. I can build it; it needs
your explicit go-ahead because it changes what anonymous visitors see.

**Also verified this pass, unrelated to photos:** `sessions` is not dead — `account/route.ts:185` issues
`delete from public.sessions where account_id = …`; the table is simply empty (0 rows) because sign-out
has never run for a member with a row. Correcting my earlier "unused table" note.
