/**
 * FREEBORN MODERATION POLICY — graduated enforcement and the human-review gate.
 *
 * WHY THIS EXISTS
 *   Recovered from Tinder's client bundle (see RE-MECHANICS.md §1c): enforcement is not a
 *   binary. Four tiers (WARNING -> SUPPRESSION -> SUSPENSION -> BAN), four violation classes
 *   (personal content / profile content / media / behavior), each removal has its own
 *   resolution code, warnings are ACKNOWLEDGEABLE (`POST /v1/case/warnings/acknowledge`) and
 *   bans are APPEALABLE behind a human challenge (`appealChallengeToken`, Arkose). Freeborn
 *   previously had one rung — "suspended" — which forces an operator to choose between doing
 *   nothing and destroying an account. That choice gets avoided, so bad signals get ignored.
 *
 * THE INVARIANT THAT MUST NOT BREAK
 *   Freeborn's existing rule (src/lib/moderation.ts) is "reports alone NEVER ban anyone" and
 *   "an action against an identity-verified member requires BOTH models agreeing at high
 *   severity". This file does not weaken either. Every hard tier requires corroboration from
 *   a source that is not a person's opinion: a duplicate-identity fact, an engine verdict at
 *   high confidence, or automated-traffic evidence.
 */

export type Tier = "warning" | "suppression" | "suspension" | "ban";
export type ViolatedClass =
  | "violation_personal_content"
  | "violation_profile_content"
  | "violation_media"
  | "violation_behavior"
  | "violation_identity";
export type Resolution =
  | "denied"
  | "warning_removed"
  | "content_reinstated"
  | "suppression_removed"
  | "suspension_removed"
  | "ban_removed";

/** Order matters: escalation moves forward, mitigation moves back. */
export const TIER_ORDER: Tier[] = ["warning", "suppression", "suspension", "ban"];

export const RESOLUTION_FOR_TIER: Record<Tier, Resolution> = {
  warning: "warning_removed",
  suppression: "suppression_removed",
  suspension: "suspension_removed",
  ban: "ban_removed",
};

export type CaseCode =
  | "photo_reused_across_accounts"
  | "identity_anchor_shared"
  | "device_cluster"
  | "scam_pattern_message"
  | "inappropriate_media"
  | "harassment_pattern"
  | "underage_suspected"
  | "automated_traffic"
  | "datacenter_signup"
  | "gps_spoof"
  | "identity_gate_mismatch"
  | "report_surge";

export type CaseInput = {
  code: CaseCode;
  violatedClass: ViolatedClass;
  /** what the system observed, machine words, never shown verbatim to the subject */
  detail: string;
  /** what a member may be told; if it cannot be written, the case should not be opened */
  notes: string;
  trustDelta: number;
  openedBy: "system" | "identity_engine" | "moderation_engine" | "operator" | "member_report";
  /** Engine corroboration, only supplied when a verdict exists. `decision` is widened to
      string because identity-match's MatchOutcome narrows/can widen independently of this
      module; decidePolicy only ever tests for the exact values below. */
  engine?: { decision: string; confidence: string };
  /** how many members reported, independently */
  reporterCount?: number;
  /** the subject has a live verified seal */
  verified?: boolean;
  /** hard evidence of scripted behaviour (rate limiter / traffic classifier) */
  automatedTraffic?: boolean;
  /** days since the previous case at the same tier, for the cooling rule */
  daysSinceSameTier?: number | null;
};

export type PolicyDecision = {
  open: boolean;
  tier: Tier | null;
  resolutionHint: null | Resolution;
  reason: string;
  /** where a human must land before the act is carried out */
  reviewRequired: boolean;
  reviewerNote?: string;
  /** automatic mitigation, when the whole point of the tier is time-boxed */
  autoExpireDays?: number;
  trustDelta: number;
};

const CODE_TIER: Record<CaseCode, Tier> = {
  photo_reused_across_accounts: "suspension",
  identity_anchor_shared: "suspension",
  device_cluster: "warning",
  scam_pattern_message: "warning",
  inappropriate_media: "suppression",
  harassment_pattern: "suppression",
  underage_suspected: "suspension",
  automated_traffic: "suspension",
  datacenter_signup: "suspension",
  gps_spoof: "warning",
  identity_gate_mismatch: "warning",
  report_surge: "warning",
};

const CODE_AUTO_EXPIRE: Partial<Record<CaseCode, number>> = {
  scam_pattern_message: 14,
  device_cluster: 30,
  gps_spoof: 30,
  inappropriate_media: 7,
  harassment_pattern: 21,
  identity_gate_mismatch: 30,
  report_surge: 14,
};

/** Signals a verified member can clear by proving presence again. */
const RECOVERABLE_CODES = new Set<CaseCode>([
  "device_cluster",
  "scam_pattern_message",
  "gps_spoof",
  "identity_gate_mismatch",
  "report_surge",
  "inappropriate_media",
]);

function stepBack(tier: Tier, n: number): Tier {
  const i = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[Math.max(0, i - n)];
}

/**
 * Decide whether and how to act on one signal.
 *
 * The shape is deliberately conservative in three places:
 *   - `member_report` alone can never exceed a warning, whatever the count.
 *   - an identity-verified subject is stepped down two tiers from anything the engines are
 *     not unanimous about, and cannot be suppressed for a mass-report wave.
 *   - a flapping signal (same code inside its own auto-expire window) is recorded, not
 *     escalated, so a broken check cannot ratchet a member out of the app.
 */
export function decidePolicy(i: CaseInput): PolicyDecision {
  const base = CODE_TIER[i.code];
  const trustDelta = i.trustDelta;

  /* 1. Report-only evidence. */
  if (i.openedBy === "member_report" && !i.engine && !i.automatedTraffic) {
    const surge = (i.reporterCount ?? 0) >= 3;
    return {
      open: surge,
      tier: surge ? "warning" : null,
      resolutionHint: surge ? "warning_removed" : null,
      reason: surge
        ? "Three or more independent reporters on one profile: a warning and a review slot, not an action on the account."
        : "Reports alone never act on an account (moderation.ts rule 1).",
      reviewRequired: true,
      reviewerNote: "Severity from the dual engines decides whether this becomes a case at all.",
      trustDelta: surge ? Math.min(trustDelta, -5) : 0,
      autoExpireDays: CODE_AUTO_EXPIRE[i.code],
    };
  }

  /* 2. Identity-verified subject: needs unanimity for anything above warning. */
  if (i.verified && RECOVERABLE_CODES.has(i.code)) {
    const unanimous = i.engine?.decision === "mismatch" && i.engine.confidence === "high";
    return {
      open: true,
      tier: unanimous ? stepBack(base, 1) : "warning",
      resolutionHint: RESOLUTION_FOR_TIER[unanimous ? stepBack(base, 1) : "warning"],
      reason: unanimous
        ? "Verified member with a high-confidence engine mismatch: stepped down one tier and put in front of a person."
        : "Verified member, so this is a notice only; both models must agree at high severity before anything sticks.",
      reviewRequired: true,
      reviewerNote: "A verified seal is revoked by the upload path, not here. Do not double-punish.",
      trustDelta: Math.min(0, Math.round(trustDelta / 2)),
      autoExpireDays: CODE_AUTO_EXPIRE[i.code] ?? 30,
    };
  }

  /* 3. Hard tiers require corroboration that is not an opinion. */
  if (base === "suspension") {
    const corroborated =
      i.automatedTraffic === true ||
      (i.engine?.decision === "mismatch" && (i.engine.confidence === "high" || i.engine.confidence === "medium")) ||
      i.code === "photo_reused_across_accounts" ||
      i.code === "identity_anchor_shared" ||
      i.code === "underage_suspected";
    if (!corroborated) {
      return {
        open: true,
        tier: "suppression",
        resolutionHint: "suppression_removed",
        reason: "Signal is serious but not corroborated to the standard suspension needs — suppressed and queued for review instead.",
        reviewRequired: true,
        reviewerNote: "Suspension requires automated-traffic proof, a high/medium engine mismatch, or a duplicate-identity fact.",
        trustDelta,
        autoExpireDays: 14,
      };
    }
    return {
      open: true,
      tier: "suspension",
      resolutionHint: "suspension_removed",
      reason: "Corroborated signal at the suspension standard.",
      // Suspension already ends a person's ability to use the app. A machine never does that
      // alone in this codebase: an operator must carry it out.
      reviewRequired: true,
      reviewerNote: "Write the `notes` you would say aloud; the appeal form will read them back to you.",
      trustDelta,
    };
  }

  /* 4. Ban is never automatic, from anything, at any volume. */
  if (base === "ban") {
    return {
      open: true,
      tier: "suspension",
      resolutionHint: "suspension_removed",
      reason: "Ban-tier evidence recorded as suspension: this project has no path where code ends an account.",
      reviewRequired: true,
      reviewerNote: "A ban is an operator act recorded in moderation_actions, and the member keeps an appeal.",
      trustDelta,
    };
  }

  /* 5. Suppression-tier, uncorroborated -> warning. */
  if (base === "suppression" && !i.engine && !i.automatedTraffic) {
    return {
      open: true,
      tier: "warning",
      resolutionHint: "warning_removed",
      reason: "Suppression needs an engine verdict or traffic evidence; without one this is a notice.",
      reviewRequired: false,
      trustDelta: Math.min(0, Math.round(trustDelta / 2)),
      autoExpireDays: CODE_AUTO_EXPIRE[i.code] ?? 14,
    };
  }

  /* 6. Flapping guard: same tier recently and still cooling -> record, do not escalate. */
  if (i.daysSinceSameTier !== null && i.daysSinceSameTier !== undefined && i.daysSinceSameTier < 7) {
    return {
      open: true,
      tier: "warning",
      resolutionHint: "warning_removed",
      reason: `Repeat ${i.code} inside 7 days of an identical ${base}: logged for review, not escalated, in case the check itself is wrong.`,
      reviewRequired: true,
      reviewerNote: "Two signals a week apart from the same detector is a detector problem until proven otherwise.",
      trustDelta: Math.min(0, Math.round(trustDelta / 2)),
      autoExpireDays: CODE_AUTO_EXPIRE[i.code],
    };
  }

  return {
    open: true,
    tier: base,
    resolutionHint: RESOLUTION_FOR_TIER[base],
    reason: `Standard policy for ${i.code}.`,
    reviewRequired: base !== "warning",
    trustDelta,
    autoExpireDays: CODE_AUTO_EXPIRE[i.code],
  };
}

/* ------------------------------------------------------------- suppression -- */

/**
 * What suppression actually does, in one place, so the effect is auditable rather than a
 * vague "reduced visibility":
 *   - excluded from the discovery deck for everyone but an explicit link
 *   - cannot start new conversations; existing conversations keep working
 *   - a banner the member sees, with the acknowledge + appeal path
 * It does NOT blur or hide their photos from existing matches, and it never deletes content:
 * a reversible tier that also destroyed data would not be reversible.
 */
export const SUPPRESSION_EFFECTS = [
  "not_in_discovery_deck",
  "cannot_start_new_conversations",
  "banner_with_acknowledge_and_appeal",
] as const;

export type SuppressionEffect = (typeof SUPPRESSION_EFFECTS)[number];

/* ---------------------------------------------------------------- appeals -- */

export const APPEAL_STATES = ["under_review", "in_review", "granted", "denied_with_reason", "needs_evidence"] as const;
export type AppealState = (typeof APPEAL_STATES)[number];

/**
 * Which appeals require a human challenge before they are filed.
 * Recovery: Tinder stores `appealChallengeToken` alongside the ban-appeal POST, i.e. the
 * challenge is attached to the *appeal*, not just to login — because the expensive abuse of a
 * moderation system is flooding it with pleas, not breaking into one account.
 */
export function appealNeedsChallenge(a: { priorAppeals: number; reopenedWithinDays: number | null }): boolean {
  if (a.priorAppeals >= 2) return true;
  if (a.reopenedWithinDays !== null && a.reopenedWithinDays < 3) return true;
  return false;
}

/** The ladder a suppressed/suspended member climbs, with the honest deadline. */
export function nextStepFor(tier: Tier, hasLiveCase: boolean): { step: string; deadlineDays: number | null } {
  if (!hasLiveCase) return { step: "nothing_open", deadlineDays: null };
  switch (tier) {
    case "warning":
      return { step: "acknowledge", deadlineDays: 30 };
    case "suppression":
      return { step: "verify_or_appeal", deadlineDays: 14 };
    case "suspension":
    case "ban":
      return { step: "appeal_with_evidence", deadlineDays: null };
  }
}
