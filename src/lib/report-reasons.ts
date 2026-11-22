/** The canonical member-facing reason set. Kept in lockstep with the live
 *  `reports_reason_check` by scripts/trust/harness.ts section [10], which reads
 *  db/migrations/2026-10-29-engine-operability.sql and asserts every value here is
 *  accepted by it. Before that test existed, production's CHECK was missing 'safety'
 *  and 500'd the whole POST — see RE-EVIDENCE-GAP-REPORT and the schema comment. */
export const REASONS = new Set([
  "fake_profile",
  "scam",
  "harassment",
  "safety",
  "underage",
  "inappropriate_media",
  /* Bumble added exactly this reason in July 2024 under Fake Profile once AI
     impersonation became a mass problem. A dating app that cannot record "this is
     generated" separately from "this is someone else" cannot tell which fraud it has. */
  "ai_generated_media",
  "other",
]);
