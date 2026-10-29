/**
 * Review-queue ordering, in its own module on purpose: the route that uses it imports
 * `@/db`, and a DB-importing module cannot be exercised by the offline harness
 * (scripts/trust/harness.ts) — which is exactly how a reordering bug would ship
 * unverified. Keeping the arithmetic pure means what is asserted is what runs.
 */
export type QueueRow = {
  origin: string | null;
  triage: string | null;
  severity: string | null;
  trustScore: number | null;
  openCases: number;
  ageHours: number;
};

export const QUEUE_WEIGHTS = {
  originMember: 40,
  originGate: -25,
  triagePending: 25,
  severityCritical: 30,
  severityHigh: 20,
  severityMedium: 10,
  trustBelow30: 20,
  trustBelow55: 10,
  perOpenCase: 10,
  openCaseCap: 30,
  ageBonusPerDay: 4,
  ageCap: 12,
} as const;

export function queuePriority(r: QueueRow): number {
  const W = QUEUE_WEIGHTS;
  let p = 0;
  /* An untriaged member report is the most ambiguous row in the system: it may be a real
     complaint nobody has judged (both engines down) or a fresh one. A gate receipt never
     needs that attention — the decision on it was already taken and already told to the
     member. So `origin` is weighed before anything else, exactly as the runbook reads it. */
  if (r.origin === "member") p += W.originMember;
  if (r.origin === "identity_gate") p += W.originGate;
  if (r.triage === "pending") p += W.triagePending;
  if (r.severity === "critical") p += W.severityCritical;
  else if (r.severity === "high") p += W.severityHigh;
  else if (r.severity === "medium") p += W.severityMedium;
  if (r.trustScore !== null && r.trustScore < 30) p += W.trustBelow30;
  else if (r.trustScore !== null && r.trustScore < 55) p += W.trustBelow55;
  p += Math.min(W.openCaseCap, r.openCases * W.perOpenCase);
  /* Age matters, capped hard: a 6-month-old row must not outrank a live safety claim. */
  p += Math.min(W.ageCap, Math.floor(r.ageHours / 24) * W.ageBonusPerDay);
  return p;
}
