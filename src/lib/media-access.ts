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
 *      NARROWED by incognito: if the owner is incognito, only a member they liked or
 *      matched with keeps this grant (deck parity). This makes the route STRICTER than
 *      the `profile_photos` RLS policy, which does not yet honour incognito — a safe
 *      direction for a byte-serving route (it can only withhold, never over-expose), and
 *      the closing RLS change is a separate, owner-gated Production migration.
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
  /** The published photo's owner has incognito on. Incognito members stay visible only to
   *  members they liked or matched with (deck parity, `src/app/api/profiles/route.ts`), so
   *  their published photo must not stream to anyone else who learned its id another way
   *  (e.g. a direct `profile_photos` read). Irrelevant unless `publishedAsVisibleProfilePhoto`.
   *  The owner is never affected: their own blob is granted earlier as the legacy sender,
   *  because a profile photo carries no `match_id`. */
  profilePhotoOwnerIncognito: boolean;
  /** The requester is a member the incognito owner liked, or has an active match with — the
   *  exact audience the deck keeps an incognito member visible to. */
  requesterIsOwnerAdmirerOrMatch: boolean;
};

export type MediaAccessReason =
  | "grant:participant"
  | "grant:legacy-sender"
  | "grant:published-profile-photo"
  | "deny:anonymous"
  | "deny:not-participant"
  | "deny:no-relationship"
  | "deny:incognito"
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
    /* Incognito narrows rule 3 ONLY. An incognito owner's published photo streams to a
       member they liked or matched with, and to nobody else — the same audience the deck
       keeps them visible to. Rules 1-2 already ran above, so a conversation participant
       and the owner (legacy sender, since a profile photo has no match id) are decided
       before this point and are never affected. Withholding the public-photo audience an
       owner paused can only turn a would-be rule-3 grant into a deny; it can never revoke
       a rule-1/2 grant, so the monotonicity the route's lazy lookup leans on still holds. */
    if (facts.profilePhotoOwnerIncognito && !facts.requesterIsOwnerAdmirerOrMatch) {
      return { allow: false, reason: "deny:incognito" };
    }
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
