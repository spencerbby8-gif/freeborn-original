# Media disappearance — diagnosis, fix and what is still unproven
**2026-10-30 · repo `spencerbby8-gif/freeborn-original` · production project `ihwtpwlszegrjgakqsxx`**

Commit `45ede8f` (on top of `244e959`, both on `1163414` = current `origin/main`).
Patch files: `patches/0002-fix-media-stop-member-media-disappearing-or-outlivin.patch`,
combined `patches/media-recovery-and-admin-route-2026-10-30.diff`.

---

## 1. What "the media disappears" actually was

Not one bug. Three independent mechanisms, all measured against the live database
with read-only `SELECT`s before anything was written. Two of them are affecting
real member accounts right now.

| # | Mechanism | Who it hits | Evidence (measured, not inferred) |
|---|---|---|---|
| 1 | `chat_media.match_id` was added (2026-10-16) and used by the read path, but **no insert ever populated the old rows**. All 11 rows were `NULL`, so `/api/chat/media/:id` fell through to its documented "legacy row → sender only" branch. | **The recipient of 6 sent attachments** could never open them. Bytes intact, authorization link absent. | `chat_media` rows 11 · `match_id IS NULL` 11 · rows referenced by a message body 6 · of those still-NULL 6 · `messages` containing an attachment 6 |
| 2 | Profile photos uploaded via the photo manager are stored as `chat_media` blobs with `storage_path = /api/chat/media/<uuid>`. That route authorises **conversation participants only** — and these blobs have no conversation. | **4 photos on 2 real accounts** (`garrisonscotthall@gmail.com` positions 1–3, `odohfridaymoses@gmail.com` position 3). Owner sees them; every other member gets a 404 in discover and on the profile. | `profile_photos` shape breakdown: 10 bucket-relative + 4 indirection + 0 `/uploads/` + 0 `data:`; `messages` referencing those paths: 0 (not chat copies that drifted); all 4 `chat_media` targets exist |
| 3 | Deleting a photo deleted the **row** and never the **bucket object** — and `profile-photos` is a *public* bucket with a bucket-wide read policy. | Anyone who ever removed a photo (or deleted an account). One orphan object sitting there today, still retrievable by URL. | 11 objects vs 10 bucket-shaped rows → exactly 1 orphan with no `profile_photos` row; `pg_policies` shows `Public read profile photos` = `SELECT` on the bucket with no ownership and no discoverability condition |

**A fourth, still latent:** `persistPhotoDataUrlToLocal` wrote bytes to
`public/uploads/<name>` and stored `/uploads/<name>` **in the live `profile_photos`
table** (I initially misread this as a separate mirror table — the import is
`profilePhotos as localProfilePhotos`, the same table). On a read-only,
per-invocation serverless filesystem that is a permanently unservable row, and
the trigger swallowed the error (`if (!error) storagePath = path;`). 0 rows of
that shape in production today, so it had not fired yet — it was armed, silent,
and unrecoverable.

Why nobody caught #2: the verification engine reads those same bytes
server-side (`src/lib/identity-match.ts`), so a member could verify successfully
while their photos showed as broken to every other member. That display/engine
asymmetry is the whole reason the bug survived.

## 2. What I changed

**`src/app/api/chat/media/[id]/route.ts`** — after the participant checks fail, a
signed-in member may read a blob **if the owner published it as their profile
photo**, gated by the *same* predicate RLS already enforces on `profile_photos`
(`profile_status='active'` + `discoverable` + `onboarding_stage in
('profile_setup','ready')`). Deliberately: it runs only as a fallback (it can
grant, never deny), it is keyed on the exact path the row publishes, and it is no
wider than the public bucket this media substitutes for. Denial stays an
indistinguishable 404; headers stay `private, no-store` + `nosniff`. No data
migration is needed for #2, so it repairs both accounts the moment it deploys.

**`db/migrations/2026-10-30-media-recovery.sql`** (applied) — backfill for #1,
from `messages.body` (the only proof of the link that exists), joining `matches`
so it can never link to a conversation that no longer exists, and
`having count(distinct match_id) = 1` so an ambiguous blob is left alone rather
than guessed. Idempotent, deletes nothing. Plus `profile_photos_storage_path_idx`
for the new lookup, which was a sequential scan per `<img>`.

**`src/app/api/profile/photos/route.ts`** (DELETE) and
**`src/lib/onboarding-store.ts`** (replace-all) — remove the bucket objects too
(#3). Two invariants: the object name is taken **from the row, never from the
request body**, and only bucket-relative shapes are sent to storage. It goes
through the member's own client, so the owner-scoped DELETE policy caps it at
their own folder. Failure is logged, not reported to the member as a failed
delete.

**`src/lib/onboarding-store.ts`** (both fallback sites) — the `/uploads/` disk
write is gone; a storage failure now mirrors bytes into Postgres at
`/api/chat/media/<id>`, the store the photo manager already uses and the path the
route above now authorises. The upload error is logged instead of swallowed.
Chose deliberately over "let onboarding fail": a member mid-signup is the worst
moment to hard-fail, and this keeps the promise the old comment made
("photos must never block onboarding") *and* makes it recoverable.

**Bucket bounds (applied)** — `profile-photos` had **no** mime allowlist and **no**
size limit while being publicly readable. Now: `image/jpeg|png|webp`, 8 MB.
Measured first: largest existing object 87,459 bytes (≈96× headroom, so nobody is
locked out of replacing a photo), only `image/jpeg` in use, and the app's own
`const MIMES = new Set(["image/jpeg","image/png","image/webp"])` is byte-for-byte
the allowlist. This also closes the "must be owner of relation buckets" note from
2026-10-16: **this role can write `storage.buckets`.**

## 3. Verification

| Check | Result |
|---|---|
| Backfill, in production, before/after | `chat_media` `match_id IS NULL` **11 → 5**; message-linked-and-NULL **6 → 0**; index present (`new_index = 1`). The 5 left are the 4 profile-photo blobs (handled by code, not SQL) + 1 blob referenced by nothing |
| Backfill safety pre-flight | all 6 candidates: `refs = 1`, `distinct_matches = 1`, and the media's sender **is** a participant of the match being linked |
| Anonymous access to a real attachment, live production | `GET /api/chat/media/011b4787-…` → **401** `text/plain` 14 B on `freeborn-umber.vercel.app`. The endpoint is not world-readable, so the new branch widens access only inside authentication |
| `npm run lint` (`eslint .`) | clean |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:harness` | **ALL PASS 278/278** (was 249; +29 new `[15]` pins) |
| `npm run check:secrets` | OK, 274 tracked files, 0 findings |
| `npm run build` | compiled; `/api/chat/media/[id]` and `/api/profile/photos` still dynamic (`ƒ`) |
| Patch deliverable | `git am` of both patches onto a pristine `1163414` tree → **identical tree hash `ca850b7f8a25c6db83abfebfeb6d2d44cf26d3a`**. `origin/main` confirmed still at `1163414d7`, so this applies to what is live |

Two harness pins failed on first run and both were **my assertions**, not the code:
I counted `if (!allowed)` (2 — the second is the grant branch itself) when the
meaningful property is "exactly one *deny*", and I over-escaped a regex. Now
rewritten to assert the real safety argument: one deny gate, and the added branch
contains no `return` and no `404`, i.e. it can only grant.

`npm run test:pose` still cannot run here: the local Postgres cluster I can create
lacks a column type `drizzle-kit push` needs, so `resetDatabase` has no tables. It
must run in CI on the PR.

## 4. Not proven by this turn — stated plainly

1. **The code half is not deployed.** No push credential exists in this sandbox
   (`git push --dry-run` → `fatal: could not read Username for 'https://github.com'`)
   and you told me never to ask for a PAT. #1 (backfill) and the bucket bounds are
   live in production now; #2 and #3 need the PR merged and promoted. Until then a
   member's 4 indirection photos stay invisible to others and new orphans keep accruing.
2. **No two-session live test** of the new media branch. Proving it properly needs a
   second real member account fetching a specific member's photo through a browser,
   plus the mirror test (a *non*-participant must still be refused). The predicate is
   a copy of the shipped RLS policy and is pinned structurally — that is weaker than a
   live request pair, and I am not claiming otherwise.
3. **The existing orphan object is still there.** Deleting `storage.objects` rows via
   SQL orphans bytes in the other direction; removal must go through the storage API,
   whose DELETE policy is owner-scoped — so this is a Dashboard action
   (Storage → `profile-photos`), with the finding query recorded in the migration.
   Code no longer *creates* orphans.
4. **`/uploads/` rows: 0 today, and no repair tool was built for any future ones.**
   Production holds none now, so a backfill would be speculative; the fallback is
   instead made unreachable in code. If any appear after deploy, they are unrecoverable
   by definition — the bytes were never stored.
5. **Deliberately not touched:** moving `verification_requests.selfie_media`
   (9 rows / 280,901 base64 chars) into the empty, private `verification-selfies`
   bucket (audit H5), and the fabricated `selfie-<uuid>-<ts>` path
   `verification_selfie_checks.storage_path` stores on upload error. Verification is
   the one subsystem with a freshly proven production run; it does not get
   destabilised inside a media-repair changeset. Both are documented in the migration
   instead, as "NOT DONE ON PURPOSE" with the reason.
6. **Reverse-engineering could not have found any of this.** REA of the competitor
   bundles attests only client-visible surface — what sinks they write to
   (`localStorage.setItem/removeItem`, `indexedDB.open`), transport choices
   (`WebSocket`), and what the UI does. It reveals nothing about how their servers
   authorize a blob, and this report makes no claim that it does. The three
   mechanisms above came from **our own** production rows plus our own source;
   reading a competitor's minified bundle would have produced a plausible-sounding
   fiction here. One of the 42 bundles (`4101edefd833a9ef.js`, 376,853 bytes on a
   single line) never analysed at all after three timeouts — the REA score is 41/42.

## 5. Also in this changeset (carried, so it isn't lost)

`244e959` — admin route reachability. The manifest and matching were **already
fine**; the real defects were no `/admin` page at all and three indistinguishable
fail-closed states with no log line. My earlier claim of "admin gate fail-closed
verified" was unsound and is corrected in `ADMIN-ROUTE-DIAGNOSIS-2026-10-30.md`:
a bare 404 cannot separate "handler refused me" from "route missing", which is why
the differential (fake sibling → 16,096 B branded HTML; real path → 9 B
`text/plain Not found`; `POST` → 405) is what settled it. `GET /api/health/engines`
refuses the same way, so it is gated too.

Still owed by you, unchanged: the two admin probes as admin then as the disposable
member, after which the test account's 14 rows + selfie + `auth.users` get deleted.
`verification_requests b3ca64c8-1b69-47e8-8331-74f192b2c321` is untouched
(`pending`, `reviewed_at NULL`, `is_verified false`, 0 suspensions) — re-confirmed by
`SELECT` this turn; nothing was approved, no admin write path was invented.
