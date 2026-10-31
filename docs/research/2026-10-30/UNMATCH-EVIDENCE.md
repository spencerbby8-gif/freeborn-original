# Unmatch, message history and media retention — evidence, then the decision

Date 2026-10-30. Written **before** the code changed, because the change is a product-semantics
decision and the brief is explicit that competitor findings must be evidence-backed, and that
nothing may be claimed about backends REA cannot see.

Every claim is tagged: **[CODE]** = a string in an acquired production bundle, with file@offset;
**[DOC]** = the vendor's own published help text; **[3P]** = third-party reporting, weaker;
**[FREEBORN]** = read out of this repository; **[INFERENCE]**; **[UNKNOWN]**.

Reproduce: `python3 re/rea-unmatch-mine.py` (71 files / 11,622,606 bytes scanned; output
`re/analysis-2026-10-30/rea/UNMATCH-MINE.json`). Bundles are not committed; `SHA256SUMS` lists
each one.

---

## 1. What Freeborn did **[FREEBORN]**

| Fact | Where |
|---|---|
| Unmatch was `delete(matches)`, twice (both pair orientations) | `src/app/api/chat/unmatch/route.ts:31,35` (pre-change) |
| `messages.match_id → matches.id ON DELETE CASCADE` | `src/db/schema.ts`, `messages` table |
| `chat_media.match_id → matches.id ON DELETE CASCADE` | `db/migrations/2026-10-16-rls-and-media-ownership.sql:130` |
| `blocks` route also did `delete(matches)` twice | `src/app/api/blocks/route.ts` (pre-change) |
| `undo swipe` also did `delete(matches)` | `src/app/api/likes/route.ts:143` (pre-change) |
| No path anywhere deletes a `chat-media` object | grep of the whole media surface |
| `chat/messages` DELETE wiped an entire thread with no confirmation | `src/app/api/chat/messages/route.ts` (pre-change, the 6th mechanism) |

Net effect: one member's single tap irreversibly destroyed a conversation for the *other* member,
removed their ability to show what was sent to them, and left the thread's photo bytes in a private
bucket attached to nothing — invisible to every query in the app. Blocking did the same thing at
the precise moment a member most needs the record preserved.

## 2. Tinder **[CODE]** — severance as a tombstone, not an erasure

From `tinder.main-dc2addb81fed3c105970.js` (752,764 B) and `re/bundles/tinder.index.html`:

- `unmatch:{path:"/user/matches/{matchId}",method:"DELETE"}` @705804 — the transport call is a
  DELETE on the match resource.
- `unmatchConversationsMatch:{path:"/v1/duos/{duoId}/matches/{matchId}",method:"PATCH"}` @708545 —
  the *same user action* in another context is a PATCH: a state transition on the match row.
- Root reducer `@516368`: `{matches, messages, channelMessages, channelSeen, passport, preferences,
  settings, unmatchedIds}` — **`unmatchedIds` is its own slice**, next to `messages`, and the
  selectors @479038 read `e.matches`, `e.messages` and `e.unmatchedIds` separately. There is an
  `optimistic/unmatchedIds/initialState` @749599. So on the client, unmatch **adds an id to a
  tombstone set while message state remains a separate store** — filtering, not forgetting.
- `removeParticipants:{path:"/v1/chat/channels/participants/delete",method:"POST"}` @708545 —
  channel *membership* is removed by its own call, distinct from the message content endpoints.
- Copy **[CODE]**: `modals.unmatch.areYouSure` "Are you sure you want to unmatch with {name}?",
  `modals.unmatch.confirm` "Yes, unmatch", `modals.unmatch.unmatchMessage` "No longer interested?
  Remove them from your matches." and, for Duos, `modals.unmatch.ifYouUnmatchDuosChat`:
  **"If you unmatch, these profiles and chat will be removed for you and {friendsName}."**
  → the consequence is stated, to both sides' effect, *in the confirm step*.
- `setMatchSeen` / `setLastSeenMatchMessage` @705804 — read state is per-match and server-written.

**[INFERENCE]** A client that keeps `messages` and `unmatchedIds` apart, and publishes "removed
*for you*", is consistent with server-side retention rather than row deletion. The retention period
is **[UNKNOWN]**; nothing here can show it.

## 3. Bumble — the asymmetry, stated by the vendor **[DOC]**

`https://support.bumble.com/hc/en-us/articles/28507915973149-Matches-that-have-disappeared`:

> "If someone unmatches you, we'll let you know they ended the chat. **The conversation will remain
> visible in your Chats, along with the time of the last message, so you can still report them if
> their behavior was inappropriate.**"
> …"Once unmatched, the conversation will be removed, and we can't recover it for you."

That is the whole model in two sentences: **recipient keeps a read-only copy for reporting; the
actor's copy is gone and unrecoverable.** Bumble also surfaces a marker ("they ended the chat")
rather than a vanishing thread, and its own guide (`https://bumble.com/en/the-buzz/unmatch-bumble`)
says "After unmatching with someone, your conversation will disappear and they won't be able to
message you or see your profile."

**[3P]** help-centre-adjacent write-ups add that Bumble asks for an (optional) reason, that
neither party is notified, and that unmatched profiles can eventually reappear in the actor's
queue. Treated as colour, not mechanism.

Bumble's *acquired* bundles contain **no messaging surface at all**: every `unmatch`, `archive`,
`conversation` and `chat` pattern returned 0, and the only `match` hits were `RegExp.match` and
`matchAll` in `bumble.polyfills-…js@65948`. Bumble's member app is an authenticated Next.js app we
never obtained. **[UNKNOWN]** — not "Bumble does not do X".

## 4. Hinge — visibility and severance are different features **[DOC]**

`https://help.hinge.co/hc/en-us/articles/36311673303571-Unmatching`:

> "Unmatching lets you remove a conversation when it no longer feels right for you. Unmatching is
> permanent; once you unmatch, the conversation will disappear, and you won't be able to message
> that person again. Note: **We are unable to restore a Match on our end.**"
> Steps: "…3. **Select the Reason for unmatching.** 4. Tap Unmatch to confirm."
> "**Looking for a way to organize your chat list without unmatching? Try the Hide feature instead;
> it removes a conversation from view but keeps the connection intact.**"

Two mechanisms worth having: a **reason on the confirm step**, and an explicit separation between
**Hide** (view) and **Unmatch** (sever). Hinge's own code is unreachable from this sandbox
(`hinge.com` → `000`, retried), so **[UNKNOWN]** how it retains server-side.

## 5. The converged model, and Freeborn's translation

| Observed across all three | Freeborn's implementation |
|---|---|
| Unmatch is **permanent**; nobody restores it | `create_or_rematch` denies severed pairs; `matches_pair_unique` + an explicit 409 instead of a constraint crash |
| Severance is **per-viewer visibility**, not row deletion | `matches.status='unmatched'` + `unmatched_by/at/reason`; `messages`/`chat_media` untouched |
| The **report path must survive** (Bumble states it; Tinder offers "Someone I'm no longer matched with" as a report category, index.html@419474/419954) | recipient keeps `view_conversation` read-only **and** `read_media`; the actor's copy is hidden, matching Bumble |
| A **confirm step** names the consequence; reason optional/required | `destructive: true` required by the API (409 `needsConfirmation` otherwise), optional validated reason |
| Neither side can message again | `send_message` denied for both, forever |
| Blocking is severance + *retention*, since it precedes a report | `blocks` route now sets `status='blocked'` instead of deleting |
| "Undo swipe" means *as if never matched* | deletes the row **only when the thread is empty**; otherwise severs (`undoMayDeleteMatchRow`) |
| Read state/unread is per-match | `count_unread` denied on severed threads; the underlying `readAt` still recorded |

Deliberate differences, stated so they are not mistaken for competitor rules:

* **No match expiry, no first-mover rule, no ranking import.** Only the retention/visibility
  mechanism is taken; nothing about *when* a connection may be ended, or who may speak first.
* The actor keeps `read_media` even though their list hides the thread. Bumble's copy implies they
  lose access; but our own blob authorization is participation-based, and re-engineering it to
  revoke the sender's own bytes would break `identity-match` and moderation review for no member
  benefit — the messages they sent are not secret from them. **[DECISION]**
* A severed pair never reappears as a match, but the deck already hides anyone you swiped on
  (the `hiddenIds` set built from `userSwipes`), so "they may resurface" needs no new filter.
  Incognito visibility, which *was* keyed on any match row, is now keyed on `status='active'`.

## 6. What stays unproven

1. **Server-side retention duration for all three** — invisible from any client. Freeborn retains
   severed history indefinitely, until account deletion or a moderation decision; that is our choice.
2. Whether Bumble/Hinge *delete* or *flag* rows server-side. Only their published member-facing
   behaviour and Tinder's client state shape are evidence.
3. Hinge's client code entirely (host unreachable from this sandbox).
4. Nothing was verified against a live Freeborn database: the migration is written and **not
   applied**, so the cascade behaviour above is proven by reading the shipped schema and the
   applied 2026-10-16 migration, and by the executed rule table (harness `[17]`, 36 assertions) —
   not by a two-account production test. That test is still owed after deployment.
