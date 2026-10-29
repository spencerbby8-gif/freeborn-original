/**
 * FREEBORN TRUST SCORE — deterministic, explainable, recomputed on signal change.
 *
 * WHY THIS EXISTS
 *   The schema has carried `user_trust_history.trust_score`,
 *   `verification_audit_logs.internal_risk_score` and `duplicate_detection_risk` since long
 *   before this change, and NOTHING in src/ ever wrote them: they were readable columns with
 *   no computation behind them, i.e. a trust system that looked present in a schema review and
 *   did nothing in production. This module is the computation.
 *
 * DESIGN RULES (each one exists because of a specific failure mode)
 *   1. DETERMINISTIC, no LLM. A verdict a member can be told about must be reproducible from
 *      the row that produced it. The vision/LLM engines feed *facts* into this (engine
 *      verdicts, mismatch counts); they never own the score.
 *   2. EXPLAINABLE. Every contribution is returned as a Factor with a human-readable label,
 *      so an appeal answer can cite the actual reason instead of a vibe.
 *   3. BOUNDED. Every weight is capped and the total is clamped to 0..100, so one noisy
 *      signal (a flaky geo check, an outage) can never end an account.
 *   4. RECOVERABLE. `verified` clears the identity-shaped penalties outright — Tinder's own
 *      framing is that a real, live person can always undo a bad-actor-looking signal by
 *      proving presence, and a score with no exit ramp only produces anger.
 *   5. NEVER THE SOLE CAUSE OF DESTRUCTION. Enforcement tiers are decided by
 *      moderation-policy.ts, which requires engine corroboration for the hard tiers; this
 *      score changes review PRIORITY and visibility, not whether a person keeps their account.
 *
 * The weights below are Freeborn's own calibration, informed by which signals the recovered
 * clients actually carry (persistent device id, session-vs-elapsed pairs, verification state,
 * report tree). They are NOT measured copies of any service's hidden scoring — nobody outside
 * Match Group or Bumble can see those, and claiming otherwise would be invented.
 */

export const TRUST_BOUNDS = { min: 0, max: 100, neutral: 50 } as const;

export type TrustSignals = {
  /** public.user_profiles.is_verified */
  verified: boolean;
  /** public.accounts.email_confirmed_at is set */
  emailConfirmed: boolean;
  /** account age in days (from accounts.created_at) */
  accountAgeDays: number;
  /** public.user_trust_history counters */
  verificationAttempts: number;
  verificationSuccesses: number;
  verificationFailures: number;
  mismatchHistoryCount: number;
  /** new columns written by identity-resolve */
  duplicatePhotoHits: number;
  sharedDeviceAccounts: number;
  /** security_events in the last 7 days, by kind */
  gpsSpoofSuspects7d: number;
  automatedTrafficBlocks7d: number;
  /** outgoing messages the scam guard flagged (recipient was warned) */
  scamFlags7d: number;
  /** open enforcement cases */
  openWarnings: number;
  openSuppressions: number;
  /** engine availability, so an outage never reads as "this member is risky" */
  enginesAvailable: boolean;
};

export type Factor = {
  key: keyof TrustSignals | "floor" | "ceiling";
  label: string;
  /** signed, already scaled */
  points: number;
  detail: string;
};

export type TrustResult = {
  score: number;
  /** 0..1, higher = more risk; this is what review queues sort on */
  risk: number;
  band: "trusted" | "stable" | "watch" | "elevated" | "critical";
  factors: Factor[];
};

type Weight = {
  key: keyof TrustSignals;
  label: string;
  /** points per unit of the signal */
  per: number;
  /** hard cap on this factor's contribution (same sign as `per`) */
  cap: number;
  /** when true, points are added for a FALSE signal instead */
  negativeWhenFalse?: boolean;
};

const WEIGHTS: Weight[] = [
  { key: "verified", label: "Identity verified", per: 12, cap: 12, negativeWhenFalse: true },
  { key: "emailConfirmed", label: "Email confirmed", per: 5, cap: 5, negativeWhenFalse: true },
  { key: "accountAgeDays", label: "Account age", per: 0.4, cap: 8 },
  { key: "verificationSuccesses", label: "Verification history", per: 4, cap: 12 },
  { key: "verificationFailures", label: "Failed verifications", per: -6, cap: -18 },
  { key: "mismatchHistoryCount", label: "Identity mismatches", per: -10, cap: -30 },
  { key: "duplicatePhotoHits", label: "Photos reused by another account", per: -14, cap: -28 },
  { key: "sharedDeviceAccounts", label: "Accounts sharing this device", per: -5, cap: -15 },
  { key: "gpsSpoofSuspects7d", label: "Location spoofing signals", per: -4, cap: -8 },
  { key: "automatedTrafficBlocks7d", label: "Automated-traffic blocks", per: -8, cap: -24 },
  { key: "scamFlags7d", label: "Scam-pattern messages", per: -3, cap: -12 },
  { key: "openWarnings", label: "Unacknowledged warnings", per: -5, cap: -10 },
  { key: "openSuppressions", label: "Active suppression", per: -10, cap: -10 },
];

/** Unverified carries a real penalty — this is the whole point of a badge — but it is small
    and it disappears the moment verification succeeds. */
const UNVERIFIED_PENALTY = -6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute the score. Pure: no I/O, no clock, no randomness — the same signals always produce
 * the same score, which is what makes the number defensible in an appeal.
 */
export function computeTrustScore(s: TrustSignals): TrustResult {
  const factors: Factor[] = [];
  let total = TRUST_BOUNDS.neutral;

  for (const w of WEIGHTS) {
    const raw = Number(s[w.key] ?? 0);
    if (w.negativeWhenFalse) {
      if (raw) {
        const pts = clamp(w.per, 0, w.cap);
        total += pts;
        factors.push({ key: w.key, label: w.label, points: pts, detail: "yes" });
      } else {
        total += UNVERIFIED_PENALTY;
        factors.push({
          key: w.key,
          label: w.label,
          points: UNVERIFIED_PENALTY,
          detail: "not established",
        });
      }
      continue;
    }
    if (raw <= 0) continue;
    const unscaled = raw * w.per;
    const pts = w.per >= 0 ? clamp(unscaled, 0, w.cap) : clamp(unscaled, w.cap, 0);
    if (pts === 0) continue;
    total += pts;
    factors.push({ key: w.key, label: w.label, points: pts, detail: `${raw} event${raw === 1 ? "" : "s"}` });
  }

  /* An engine outage is not a member's fault: identity-shaped penalties are halved when no
     verdict could be produced at all, and the reason is recorded rather than hidden. */
  if (!s.enginesAvailable) {
    const identityKeys = new Set<string>([
      "verificationFailures",
      "mismatchHistoryCount",
      "duplicatePhotoHits",
    ]);
    let recovered = 0;
    for (const f of factors) {
      if (identityKeys.has(f.key as string) && f.points < 0) {
        const half = Math.round(f.points / 2);
        recovered += f.points - half;
        f.points = half;
        f.detail += " (halved: engines unavailable, treated as doubt about the check)";
      }
    }
    total -= recovered;
    if (recovered !== 0) {
      factors.push({
        key: "floor",
        label: "Engine outage adjustment",
        points: -recovered,
        detail: "identity penalties reduced because no verdict was obtainable",
      });
    }
  }

  const floored = clamp(Math.round(total), TRUST_BOUNDS.min, TRUST_BOUNDS.max);
  if (floored !== Math.round(total)) {
    factors.push({
      key: floored < Math.round(total) ? "floor" : "ceiling",
      label: "Bound applied",
      points: floored - Math.round(total),
      detail: `clamped to ${TRUST_BOUNDS.min}..${TRUST_BOUNDS.max}`,
    });
  }

  const risk = Math.round(((TRUST_BOUNDS.max - floored) / TRUST_BOUNDS.max) * 1000) / 1000;
  const band: TrustResult["band"] =
    floored >= 75 ? "trusted" : floored >= 55 ? "stable" : floored >= 35 ? "watch" : floored >= 20 ? "elevated" : "critical";

  return { score: floored, risk, band, factors: factors.sort((a, b) => a.points - b.points) };
}

/** SQL-ready numeric string for a numeric() column. */
export function trustScoreToNumeric(r: TrustResult): string {
  return r.score.toFixed(2);
}

/**
 * What a member is allowed to be told. Kept separate from `factors` because some factors are
 * investigative (device sharing, other accounts) and naming them to the subject would tip off
 * exactly the behaviour we are trying to see more of.
 */
export function memberVisibleFactors(factors: Factor[]): Factor[] {
  const privateKeys = new Set<string>(["sharedDeviceAccounts", "duplicatePhotoHits", "gpsSpoofSuspects7d"]);
  return factors.filter((f) => !privateKeys.has(f.key as string));
}
