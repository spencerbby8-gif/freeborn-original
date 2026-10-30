# The read-only thread needed a UI state — 2026-10-30

## The defect

`decideMatchAccess` (`src/lib/match-lifecycle.ts`) deliberately answers **read** and **send** as
separate questions, because that asymmetry is the product decision from `UNMATCH-EVIDENCE.md`:
the member who was unmatched keeps the conversation to read and report from
(`grant:read-only-for-report`), while the member who ended it loses their own copy.

The API enforced it. The client never asked. `chat-view.tsx` disabled the composer only on
`sending || uploading || empty text`, so the member left holding a read-only thread saw a normal
input box, typed into it, got a **403**, and was told:

> Couldn't send. Check your connection.

…with a **"Not delivered — retry"** affordance under the bubble, inviting them to repeat an action
the server declined on purpose. Two false statements in one flow: it was not a connectivity
problem, and a retry could never work.

This is the same class of defect as the delete-conversation bug fixed earlier on this branch —
the API was hardened in one turn and the UI was left behind in another, and no gate could see the
gap because both halves are individually valid code.

## What changed

**Server** — `GET /api/chat/messages` now returns, next to `messages`:

```jsonc
"thread": { "canSend": false, "status": "unmatched",
            "reason": "deny:thread-not-open",
            "notice": "This conversation has ended, so its history is kept…" }
```

computed by calling `decideMatchAccess({ …, action: "send_message" })` on the row the
`view_conversation` check already returned. No second query, and — pinned — no re-derived rule:
the route contains no `status === "unmatched"` comparison, because a second copy of the table is
how the next drift bug starts.

**Pure core** — `classifySendFailure(status)` / `offersRetryAfter(kind)` in `src/lib/chat-sync.ts`:

| status | kind | retry offered |
|---|---|---|
| `null` (never answered), `0`, `NaN`, `<100` | `retryable` | yes |
| `401` | `session` | yes — a silent refresh can deliver the *same* text |
| `429` | `retryable` | yes — the backoff already owns the wait |
| `400 / 403 / 404 / 409 / 413 / 422 / 431` | `permanent` | **no** |
| `5xx` | `retryable` | yes |

The permanent branch is the narrow one (4xx only): anything else must stay retryable, so an
unexpected status can never *silently* strand a message. `Number.isFinite` is checked because
`NaN >= 500` is false, which would otherwise classify a NaN as `permanent`.

**Client** — `chat-view.tsx`:
- stores `threadAccess` and **re-reads it on every fetch**, so a thread that ends while it is
  open updates without a reload;
- when `canSend` is false, renders `<ReadOnlyThreadNotice/>` **in place of** the composer
  (extracted into `src/components/app/read-only-thread-notice.tsx` so the browser harness can
  mount the real thing rather than a grep);
- a bubble declined on policy grounds shows **"Not delivered"** with no retry affordance, and the
  server's own wording instead of "check your connection";
- a policy refusal also **closes the composer**, so the state is self-healing rather than
  waiting for a poll;
- the verdict is enforced at the one write choke point (`deliver`), before the `fetch`, and that
  path returns **`false`** — never `true`, which would tell the caller the message went out.
  `threadAccess` is a dependency of the callback, so the guard cannot read a stale verdict.

## Evidence

- `scripts/qa/pg-migration-verify.sh` — **38/38** (the storage semantics this UI reflects).
- `scripts/trust/harness.ts` `[22]` — **32 assertions executed (16 checks; the status table runs 17 inputs), 457/457 total**, including:
  the full status table; a **property over all 500 statuses** (no 4xx policy code may offer a
  retry; no 1xx/2xx/3xx/5xx may withhold one); the guard's **position** (before
  `method: "POST"`, sliced to `retrySend` because a file-wide `indexOf` found a different POST);
  `return false` and not `return true`; `threadAccess` present in the dependency array; the route
  not re-deriving lifecycle rules.
- `scripts/qa/dialog-check.mjs` — **44/44** in headless Chromium, now mounting the notice at both
  viewports: default copy vs server-supplied copy, **8.15:1** contrast at 12.5px, `w:342` inside
  a 390 viewport, and at desktop `w:680, left:300` centred against the parent's
  `max-w-[680px]` — the fixture wraps it exactly as `chat-view.tsx:1633` does, because the bubble
  has no intrinsic width on purpose.
- Screenshot: `dialog-readonly-notice.png`.

Three of my own assertions were wrong before they were right, and it is worth recording how:
one judged the component's **doc comment** for the word "connection" (the comment exists to explain
why the copy must not say it); one clipped a screenshot 2000px down a page and threw; and one
"phone viewport" check silently measured the **desktop** width left over from the previous section
and passed on `w:1232`. A green assertion that measured the wrong axis is worse than a red one.

## Not verified here

* **No two real signed-in members.** The read-only state was rendered from the product component
  in a browser and the decision path is executed in the harness, but no test in this session had
  two authenticated accounts with one unmatched by the other. That end-to-end pass needs the
  owner's disposable pair.
* **The `restricted` privacy path** (a member who only accepts messages from matches) is folded
  into "permanent" by status code (403), which is correct for retry semantics but means the copy
  is whatever the server sent; no dedicated wording was invented for it.
* Optimistic UI still shows the bubble before the verdict arrives; only `blocked` changes after.

## Deployment order (this is why the migration must lead)

`GET` reads `match.unmatchedBy`, which does not exist in production until
`db/migrations/2026-10-30-unmatch-detach.sql` is applied — the same column the rest of this branch
already depends on. So: **apply the migration, verify with the script, then deploy.** The
verifier's own first assertion is that today's schema *rejects* `status='unmatched'`, which is the
falsifiable form of that ordering requirement.
