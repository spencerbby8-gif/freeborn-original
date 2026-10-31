/**
 * Who may read a media blob. Pure, so the whole truth table can be executed rather
 * than argued about — `scripts/trust/harness.ts` section [15] enumerates every
 * combination of these facts and asserts the answer for each one.
 *
 * Why a separate module: the rule was written inline in
 * `src/app/api/chat/media/[id]/route.ts`, which meant the only way to test it was to
 * pattern-match the route's source. That is how the 2026-10-30 "recipients cannot open
 * attachments" and "profile photos are invisible to other members" defects stayed alive —
 * each half looked right in its own file, and nothing executed the pair together.
 *
 * The rules, in the order the product needs them:
 *   0. anonymous                       -> deny. Authentication is enforced in the route
 *      too; restating it here keeps the function honest if it is ever reused.
 *   1. both participants of the match  -> grant. A conversation attachment is readable
 *      by the two people IN it. This is the fix for "the other side never sees it".
 *   2. sender, but ONLY if the blob has no conversation  -> grant. Pre-2026-10-16 rows
 *      carry no `match_id`, so the sender is the only relationship that can be proven.
 *      Deliberately NOT "the sender may always read": a row that is linked to a
 *      conversation must not be readable by an id that has since left it, and a
 *      "simplify by always allowing the sender" edit is exactly what the tests here
 *      reject.
 *   3. published as a visible profile photo -> grant. A member who put an image on their
 *      own profile has chosen that audience. Gated by the caller on the SAME predicate
 *      RLS enforces on `profile_photos` (active + discoverable + onboarded), so hiding
 *      or pausing a profile revokes it immediately without touching the media row.
 *   4. anything else                   -> deny.
 *
 * Monotone by construction: no fact can turn a grant into a deny. That is asserted, not
 * assumed, because the route leans on it — it looks rule 3 up lazily, only after rules
 * 1-2 failed, and a non-monotone rule would make that optimisation a behavioural change.
 */

export type MediaAccessFacts = {
  /** `auth.uid()` of the requester; null when there is no session. */
  requesterId: string | null;
  /** `chat_media.sender_id`, or null when the row is missing/corrupt. */
  mediaSenderId: string | null;
  /** `chat_media.match_id`. Null means "uploaded before ownership links existed". */
  mediaMatchId: string | null;
  /** Requester is `user_a` or `user_b` of `mediaMatchId`. Ignored when that is null. */
  requesterIsParticipant: boolean;
  /** The blob is the profile photo of a member whose profile is currently member-visible. */
  publishedAsVisibleProfilePhoto: boolean;
};

export type MediaAccessReason =
  | "grant:participant"
  | "grant:legacy-sender"
  | "grant:published-profile-photo"
  | "deny:anonymous"
  | "deny:not-participant"
  | "deny:no-relationship"
  | "deny:missing-row";

export type MediaAccessDecision = { allow: boolean; reason: MediaAccessReason };

export function decideMediaAccess(facts: MediaAccessFacts): MediaAccessDecision {
  if (!facts.mediaSenderId && !facts.mediaMatchId) {
    // Called with nothing to decide on: the row does not exist. The route answers 404
    // before ever reaching here, so this branch is a guard against a future caller, not
    // a live path — and it must not be the same as "sender unknown, allow anyway".
    if (!facts.requesterId) return { allow: false, reason: "deny:anonymous" };
    return { allow: false, reason: "deny:missing-row" };
  }
  if (!facts.requesterId) return { allow: false, reason: "deny:anonymous" };

  if (facts.mediaMatchId && facts.requesterIsParticipant) {
    return { allow: true, reason: "grant:participant" };
  }
  if (!facts.mediaMatchId && facts.mediaSenderId === facts.requesterId) {
    return { allow: true, reason: "grant:legacy-sender" };
  }
  if (facts.publishedAsVisibleProfilePhoto) {
    return { allow: true, reason: "grant:published-profile-photo" };
  }
  return {
    allow: false,
    reason: facts.mediaMatchId ? "deny:not-participant" : "deny:no-relationship",
  };
}

/**
 * Whether rule 3's lookup is worth running: only when nothing above granted. Keeps the
 * common path (a member opening their own conversation's photo) at one query.
 */
export function needsPublishedProfilePhotoLookup(facts: MediaAccessFacts): boolean {
  return !decideMediaAccess({ ...facts, publishedAsVisibleProfilePhoto: false }).allow;
}
