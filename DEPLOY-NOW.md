# Push + deploy — exact steps (from workspace commit 63827d3)

Local state when this was written: `HEAD = 63827d3`, `origin/main = c445c7c`, **4 commits ahead**,
working tree clean, `node_modules` installed, and these all pass: `tsc --noEmit`,
`npm run lint`, `npx next build`, `npm run check:secrets`,
`scripts/trust/harness.ts` (86/86, exit 0).

## 1. Create a token (do it yourself — never paste it into chat)

<https://github.com/settings/tokens/new>

- Note: `freeborn-deploy`
- Scope: **`repo` only** (the repo is private). Nothing else.
- Expiration: 30 days, then revoke it.

## 2. Store it without leaving it in shell history

```bash
umask 077
read -rs GH_TOKEN && printf '%s' "$GH_TOKEN" > /tmp/gh_tok && unset GH_TOKEN
```

Paste the token when `read` prompts, press Enter. It is then in a 0600 file only.

## 3. Push

```bash
cd ~/freeborn-original
git config user.name  "Arena Agent"
git config user.email "agent@arena.local"      # sandbox resets these every session
TOK=$(cat /tmp/gh_tok)
git -c http.extraHeader="Authorization: Basic $(printf 'oauth2:%s' "$TOK" | base64 -w0)" \
    push https://github.com/spencerbby8-gif/freeborn-original.git HEAD:main
unset TOK
shred -u /tmp/gh_tok
```

Note on auth: `Authorization: Bearer <ghp_…>` **fails** against git-over-HTTPS here (REST accepts
the same token; git does not). Basic with the token as the password is the form that works.

Commits being pushed:

```
63827d3 docs(RE): production 200-on-unknown-api-path finding and the true origin/main state
94fa668 fix(trust): measured PoW difficulty, deck/suppression parity, and the RE-MECHANICS record
a1063aa feat(trust): identity enforcement recovered from REA — hashing, dedup, trust, cases, PoW
709e7a3 docs(audit): PASS 4 — shipped record …            <- this one was never pushed either
```

## 4. Deploy

The Vercel project is already wired to `spencerbby8-gif/freeborn-original`, production branch
`main`, so the push triggers the build. Watch it:

- Dashboard: <https://vercel.com/spencerbby8-5225s-projects/freeborn>
- or `gh run list` / the deployment URL printed by the GitHub check.

If it does not auto-trigger, the deploy hook is empty (`"deployHooks": []`), so push a no-op
commit or press **Deploy** in the dashboard from `main`.

## 5. Environment variables that must exist for the new code

All already set for `production` (verified by reading the project's env list):
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_TRANSACTION_POOLER`, `NEXT_PUBLIC_APP_URL`,
`FREEBORN_ALLOWED_ORIGINS`, plus the `sensitive` engine keys.

New in this change set, **optional and deliberately absent**:

| Key | If unset | To enable |
|---|---|---|
| `FREEBORN_HUMAN_CHALLENGE` | `record` — challenges are counted and logged, never block | set to `enforce` |

`FREEBORN_HUMAN_CHALLENGE` is read in 5 places (issue, verify, appeals, and their tests). There is
**no** photo-hashing kill-switch flag: hashing is unconditional, and a failed hash records
`phash_d IS NULL`, which the code treats as "unknown", never as "no duplicate". I initially wrote
that such a flag existed; it does not, and inventing an env var in a runbook is how an operator ends
up setting nothing.

Do **not** set `FREEBORN_HUMAN_CHALLENGE=enforce` until the app client actually solves the
challenge (see §7). Enforcing first would gate appeals behind a puzzle nobody can answer.

## 6. Verify in production (exact commands + expected results)

```bash
D=https://freeborn-umber.vercel.app
for p in /api/trust/self /api/safety/cases /api/device/self /api/human/issue /api/human/verify; do
  printf "%-24s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST -H 'Content-Type: application/json' -d '{}' $D$p)"
done
```

Expected, in order: `401 401 401 401 401` — every new route is auth-gated. **Any `200` here is a
failure**: read `RE-MECHANICS.md` §2.6 — unmatched API paths currently answer `200` with the HTML
404 page, so a `200` means the route did *not* mount, not that it worked. Confirm
`x-matched-path` in `curl -i`; it must not be `/_not-found`.

Cross-origin rejection (CSRF guard) — expect `403`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -m 20 -X POST $D/api/device/self \
  -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}'
```

Schema state (must be unchanged by the deploy — deploys never run migrations here):

```sql
select table_name, column_name, data_type, character_maximum_length
  from information_schema.columns
 where table_schema='public'
   and column_name in ('phash_d','phash_a','phash_bytes','photo_dhash','photo_ahash',
                       'anchor','device_hash','token_hash')
 order by table_name, column_name;
-- every row: data_type 'character'; length 16, except phash_bytes = 64

select public.hamming64('ffffffffffffffff','0000000000000000') as sixty_four,      -- 64
       public.hamming64('8000000000000000','ffffffffffffffff') as sixty_three,      -- 63
       public.hamming64('0000000000000001','0000000000000000') as one,              -- 1
       public.hamming64('zz',      '0000000000000000')          as malformed_null;   -- NULL
```

Signed-in behaviour that cannot be checked with curl alone — do these in a browser session:

1. Upload a **new** photo to a profile, then
   `select id, phash_d, phash_bytes, phash_at from public.profile_photos order by created_at desc limit 1;`
   → `phash_d` 16 hex chars, `phash_bytes` 64 hex chars, `phash_at` non-null. This is the write
   that failed with `22P02` before the schema fix.
2. Re-upload the **same file** from a second account → a row appears in `public.enforcement_cases`
   with `code='photo_reused_across_accounts'` and `tier='suspension'`. There is **no
   `review_required` column** — the live table has 18 columns and that is not one of them. The flag
   is a policy *decision* returned to the caller and persisted inside
   `security_events.detail` as `review_required=1`; check it with:

   ```sql
   select kind, detail, created_at from public.security_events
    where kind like '%case%' order by created_at desc limit 3;
   ```
3. `GET /api/trust/self` → non-50 JSON with `score`, `band`, `factors`; and after (1) or (2),
   `user_trust_history.trust_score` for that member has changed from 50.
4. `POST /api/safety/cases/ack` with the member's own warning `caseId` → `{"ok":true}`; with
   someone else's `caseId` → `404 not-found`.
5. The anonymous deck (`GET /api/profiles`) must not contain a member with an open `suppression`
   case. Verify by opening one, re-requesting the deck, then resolving it.

## 7. Known follow-ups, in priority order

1. **Client for the human challenge.** `/api/human/issue` and `/api/human/verify` exist and are
   tested, but no Freeborn UI solves them, so appeals run in `record` mode forever unless that is
   built. A ~40-line worker that loops `sha256(nonce + ":" + n)` until the first `difficultyBits`
   bits are zero, then POSTs the counter.
2. **JSON 404 for `/api/*`** (§2.6). Until then every missing endpoint looks like a success.
3. **Rotate**: the DB pooler password and every GitHub PAT pasted into this conversation should be
   treated as compromised.
4. **7 bucket photos are unhashed** because their bytes are in the Supabase storage bucket, not
   `chat_media`. Backfill needs a service-key fetch; it was left undone rather than faked.
5. **`TURN`/relay and `profile-photos` public-bucket lockdown** remain open from the audit.
