/**
 * What an unmatch is allowed to do — and what it is not.
 *
 * Pure, so the whole fact space can be executed (harness section [17]) instead of argued.
 * This module exists because Freeborn's unmatch was a `delete(matches)`, and
 * `messages.match_id` / `chat_media.match_id` are both `on delete cascade`: one tap quietly
 * destroyed a shared history for BOTH members, unrecoverably, and orphaned the conversation's
 * photo bytes in the bucket with no row left to find them.
 *
 * What the three competitors actually do, from their shipped clients and their own published
 * help-centre text (evidence + citations in docs/research/2026-10-30/UNMATCH-EVIDENCE.md):
 *
 *   * Tinder's client keeps `matches`, `messages` and an `unmatchedIds` slice as THREE separate
 *     pieces of state (main-dc2addb81fed3c105970.js@479038, @516368), with an optimistic
 *     `./optimistic/unmatchedIds/initialState` (@749599), while the transport call itself is
 *     `unmatch:{path:"/user/matches/{matchId}",method:"DELETE"}` (@705804). So the client's model
 *     is a tombstone set plus retained message state — not "forget the rows". The same client also
 *     exposes `unmatchConversationsMatch:{...method:"PATCH"}` (@708545): the identical user action
 *     expressed as a state transition on the match resource.
 *   * Bumble's help centre is explicit about the asymmetry: when someone unmatches you, "the
 *     conversation will remain visible in your Chats, along with the time of the last message, so
 *     you can still report them if their behavior was inappropriate" — while for the person who
 *     tapped unmatch it is removed and "we can't recover it for you".
 *   * Hinge separates the two primitives outright: unmatch is permanent severance, and its help
 *     centre points at **Hide** for "organize your chat list without unmatching… keeps the
 *     connection intact". All three present a confirmation before severing, and Bumble and Hinge
 *     both offer a reason.
 *
 * Freeborn's translation, keeping its own niche (a community where a cut-off member may be the
 * only person who can testify about a scammer):
 *
 *   1. **Sever, never destroy.** The match row survives with `status='unmatched'`. Messages and
 *      attachments survive with it. Nothing here is a cascade any more, so the byte-orphaning
 *      disappears as a side effect rather than needing a sweeper.
 *   2. **Asymmetric visibility, per Bumble's rule.** The member who unmatched loses the
 *      conversation from their list and cannot reopen it — their decision is honoured. The member
 *      who was unmatched keeps reading it, read-only, so they can still report what happened.
 *      Deleting someone's evidence is not a privacy feature when the other person chose to leave.
 *   3. **No channel for either side.** Sending is refused for both, forever: all three vendors
 *      treat unmatch as terminal, and `matches_pair_unique` already prevents a second row for the
 *      pair, so "they may reappear in your deck" is answered here rather than by a rematch path.
 *   4. **A real delete still exists** — account deletion, which is the ONLY thing allowed to
 *      cascade, and the reason the `on delete cascade` FKs stay in place.
 *
 * Nothing in this file is a claim about competitor servers. It is a claim about what their
 * shipped browsers do and what they publish, translated into Freeborn's own data model.
 */

export type MatchLifecycleStatus = "active" | "archived" | "blocked" | "unmatched";

/** The reasons offered in the confirm sheet. Vocabulary is Freeborn's; the *existence* of a
 *  reason step is what Bumble and Hinge both do, and it doubles as moderation signal. */
export const UNMATCH_REASONS = [
  "not_interested",
  "met_someone",
  "moved_off_app",
  "inappropriate",
  "safety",
  "other",
] as const;
export type UnmatchReason = (typeof UNMATCH_REASONS)[number];

export function isUnmatchReason(value: unknown): value is UnmatchReason {
  return typeof value === "string" && (UNMATCH_REASONS as readonly string[]).includes(value);
}

export type MatchAction =
  | "view_conversation"
  | "send_message"
  | "read_media"
  | "appear_in_chat_list"
  | "count_unread"
  | "create_or_rematch"
  | "export_own_data";

export type MatchAccessFacts = {
  /** `matches.status`. `null` means the match row does not exist at all. */
  status: MatchLifecycleStatus | null;
  /** Requester is `user_a` or `user_b`. */
  isParticipant: boolean;
  /** Requester is `matches.unmatched_by` — i.e. they are the one who severed it. */
  isActor: boolean;
  /** There is at least one message in the thread. Only `create_or_rematch` reads it: an
   *  "undo" of a swipe that has become a real conversation is an unmatch, not a time machine. */
  hasMessages: boolean;
  action: MatchAction;
};

export type MatchAccessDecision = { allow: boolean; reason: string };

const SEVERED: MatchLifecycleStatus[] = ["unmatched", "blocked"];

/**
 * The table. Every branch is reachable and asserted; the order never matters because each
 * action is decided independently (no rule can turn another's allow into a deny except by
 * being the row's own status), which is what lets routes call it from different places.
 */
export function decideMatchAccess(f: MatchAccessFacts): MatchAccessDecision {
  if (!f.status) return { allow: false, reason: "deny:missing-row" };

  switch (f.action) {
    case "export_own_data":
      // A data export is the member's own record, severed or not. Refusing here would make
      // deletion-noticeable by omission.
      return f.isParticipant
        ? { allow: true, reason: "grant:own-data" }
        : { allow: false, reason: "deny:not-participant" };

    case "read_media":
      // Both former participants keep opening attachments they were actually sent. This is
      // deliberate: the recipient's ability to show what happened is the whole point of keeping
      // the rows, and the actor already chose to leave — refusing them the bytes they were
      // party to achieves nothing except breaking that evidence trail. Authorization is still
      // participation-based; nothing widens to strangers.
      return f.isParticipant
        ? { allow: true, reason: "grant:former-or-current-participant" }
        : { allow: false, reason: "deny:not-participant" };

    case "view_conversation":
      if (!f.isParticipant) return { allow: false, reason: "deny:not-participant" };
      if (f.status === "active" || f.status === "archived") return { allow: true, reason: "grant:participant" };
      if (f.isActor) return { allow: false, reason: "deny:actor-severed-it" };
      return { allow: true, reason: "grant:read-only-for-report" };

    case "appear_in_chat_list":
      if (!f.isParticipant) return { allow: false, reason: "deny:not-participant" };
      if (f.status === "active" || f.status === "archived") return { allow: true, reason: "grant:participant" };
      if (f.isActor) return { allow: false, reason: "hide:actor-severed-it" };
      return { allow: true, reason: "show:read-only-ended" };

    case "count_unread":
      // An ended thread must not nag. Unread state is still recorded (it is part of the
      // evidence), it simply never surfaces as a badge.
      if (!f.isParticipant) return { allow: false, reason: "deny:not-participant" };
      return SEVERED.includes(f.status) ? { allow: false, reason: "deny:thread-severed" } : { allow: true, reason: "grant:participant" };

    case "send_message":
      if (!f.isParticipant) return { allow: false, reason: "deny:not-participant" };
      // 'archived' keeps writing on purpose: it is Freeborn's existing soft state, ignored by
      // every route today, and quietly turning it into read-only would be an unannounced
      // behaviour change smuggled in under a media fix. Only a SEVERED thread closes.
      if (f.status === "active" || f.status === "archived") return { allow: true, reason: "grant:participant" };
      return { allow: false, reason: "deny:thread-not-open" };

    case "create_or_rematch":
      if (!f.isParticipant) return { allow: false, reason: "deny:not-participant" };
      // A severed pair never reopens. `matches_pair_unique` makes a second row impossible
      // anyway; answering here turns that into a message instead of a constraint error.
      if (f.status === "active" || f.status === "archived") return { allow: false, reason: "deny:already-matched" };
      return { allow: false, reason: "deny:severed-is-permanent" };
  }
}

/** What the API answers when a send is refused, so the message is the same everywhere. */
export function severedMessage(status: MatchLifecycleStatus | null): string {
  if (status === "blocked") return "You can't message this member.";
  return "This conversation has ended. Unmatching is permanent in Freeborn: neither of you can send again, and the history stays available to read and to report.";
}

/** Whether an "undo swipe" may delete the match row outright, or must sever it instead. */
export function undoMayDeleteMatchRow(hasMessages: boolean): boolean {
  return !hasMessages;
}
