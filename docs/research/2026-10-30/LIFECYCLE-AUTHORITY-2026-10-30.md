# Two authorities for one question — found and closed, 2026-10-30

## What was wrong

`decideMatchAccess` (`src/lib/match-lifecycle.ts`) is the project's single table for
"may this member do this to this conversation". It declares seven actions. Five had call sites;
**two did not**:

| action | callers found |
|---|---|
| `view_conversation`, `send_message` | `api/chat/messages/route.ts` |
| `appear_in_chat_list`, `count_unread` | `api/chat/matches/route.ts` |
| `create_or_rematch` | `api/chat/start/route.ts` |
| `read_media` | **none** — `api/chat/media/[id]/route.ts` computed `requesterIsParticipant = Boolean(participant)` from its own `or(userA, userB)` query and handed that boolean to `decideMediaAccess` |
| `export_own_data` | none (deliberate; see below) |

So the answer to *"may a former participant still open the media they were sent?"* was written in
two places at once. They agreed today — the route's query ignored `matches.status`, and the table's
`read_media` row ignores it on purpose — but nothing kept them agreeing. Narrowing `read_media`
later (the obvious next edit, e.g. to stop serving bytes from blocked threads) would have changed
every surface **except** media, silently, and the member who was unmatched would keep their
evidence while the product elsewhere lost it — or vice versa. That is precisely the defect class
this branch has now hit three times: hardened rule, unupdated call site, no gate able to see the gap.

An uncalled rule is also untested by construction: `read_media`'s careful comment describing
"grant:former-or-current-participant" was describing nothing that ran.

## What changed

`api/chat/media/[id]/route.ts` now selects `status` and `unmatchedBy` alongside the row it already
fetches (indexed by `matches.id`, so no extra query — the row was already loaded) and derives:

```ts
requesterIsParticipant = decideMatchAccess({
  status, isParticipant: true, isActor: conversation.unmatchedBy === member.id,
  hasMessages: false, action: "read_media",
}).allow;
```

Behaviour is **unchanged** today (the table grants participants in every status, which is what the
route was doing) — the point is that there is now one place to change. `decideMediaAccess` keeps
its own responsibilities: the anonymous case, the legacy sender-only blob, and the
published-profile-photo audience rule, none of which are match-lifecycle questions.

`export_own_data` stays uncalled, and that exception is now *checked* rather than assumed:
`GET /api/account/export` authorises by identity equality (`member.id`) rather than per match, so a
per-match decision would be ceremony. The harness allow-list must be justified at the table itself
(`ok("[23] and every excuse is justified at the table, not only in this test")`), so an exception
cannot be added quietly.

## Evidence

`npm run test:harness` — **464/464**, including eight new/rewritten assertions:

* delegation is present *and* the old shortcut is gone (`!/requesterIsParticipant = Boolean\(/`),
  so a revert to the second authority fails loudly;
* the route loads the facts the table needs;
* **every `MatchAction` is either requested by a caller or explicitly excused**, computed by
  walking `src/**` for `action: "…"` literals — a future dead rule trips this instead of rotting;
* `[17]`'s media pin was **rewritten from a source-shape check into an executed property**: for all
  four statuses and for both actor/non-actor, `read_media` must allow a participant, and a stranger
  with no row must be denied. The old form asserted the file's text (`= Boolean(participant)`),
  which this change legitimately altered.
* a **sensitivity control**: the same all-states predicate evaluated against `count_unread` must
  come out **false**. Without it, "true for every status" cannot be distinguished from a predicate
  that never evaluated the status axis at all.

Unchanged and still green: `tsc` 0, `eslint` 0, `next build` 0,
`scripts/qa/pg-migration-verify.sh` 38/38, `dialog-check.mjs` 44/44, `check:secrets` 325 files.

One gate almost lied twice on the way in: `npx tsc … | head` reported `rc=0` while the pipeline
swallowed the real status, and `next build` — which type-checks `scripts/` too — was the thing that
caught the actual error. `| tail`/`| head` is not a pass.

## Not verified

* No member session, so no HTTP response was ever fetched for a severed thread's attachment; the
  media route's grant is verified as a decision, not as a served byte stream.
* `decideMediaAccess`'s own truth table (96 combinations, from the earlier commit) still covers the
  legacy-blob and published-profile-photo rules; those paths were not re-run against the new call
  site beyond the harness's static checks.

## Deployment

No new migration. This rides with the rest of the branch, whose order requirement is unchanged:
**`2026-10-30-unmatch-detach.sql` first** (it adds `matches.unmatched_by`, which this route now
reads, and `2026-10-30-chat-signals.sql` next for the realtime layer), then merge and deploy.
As of this writing both are applied to **no** database and the branch is unmerged, so production's
media behaviour is untouched.
