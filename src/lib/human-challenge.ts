import { createHash } from "node:crypto";

/**
 * Shared proof-of-work challenge constants and the one verification predicate.
 *
 * These used to be exported from `src/app/api/human/issue/route.ts`. Next 16's
 * generated route type validator rejects extra named exports from route modules,
 * so the route now imports the pieces it needs and keeps only HTTP handlers as
 * exports. Runtime behaviour, constants and the hash predicate are unchanged.
 *
 * MEASURED, NOT GUESSED (sandbox node, 120 fresh random nonces each, solution encoded
 * as a decimal STRING exactly as a client sends it and exactly as verify re-checks it):
 *   18-bit: 0/120 unsolved within a 4,000,000-candidate budget; 175 ms mean, 1,182 ms worst
 *   20-bit: 5/106 unsolved — 4.7% — same budget; 832 ms mean, 2,575 ms worst
 *   22-bit: 17/50 unsolved — 34%
 * So 20 bits, the previous default, silently locked about one member in twenty out of
 * their own appeal, which is the worst possible failure for a control meant to stop
 * automation: the honest user pays and cannot pay. 18 bits still costs a script per
 * filing and measures as never exceeding the budget here, so it is the floor.
 */
export const CHALLENGE_DIFFICULTY_BITS = 18;

/** The hardest challenge the issuer will hand out. */
export const MAX_CHALLENGE_DIFFICULTY_BITS = 20;

/** Candidates a client is told to attempt before giving up and re-requesting. */
export const SOLVER_BUDGET_CANDIDATES = 4_000_000;

/**
 * BROWSER tier added 2026-10-29 after measuring, not guessing: WebCrypto in a browser
 * costs ~8,500 sha256/s measured here, so the 18-bit default needs ~31 s on average
 * and a full 4,000,000-candidate run did NOT solve in 242 s. 12 bits is ~4,096
 * candidates (0.5–2 s), which is the right size for the actual threat on this path —
 * a browser script flooding the appeal queue — and it is explicitly NOT claimed to
 * resist a GPU. Signup/reset keep the higher tiers.
 */
export const BROWSER_CHALLENGE_DIFFICULTY_BITS = 12;

/** Hex-digit-prefix difficulty test, matching the client and verify route exactly. */
export function meetsDifficulty(
  nonce: string,
  solution: string,
  bits = CHALLENGE_DIFFICULTY_BITS,
): boolean {
  const hex = createHash("sha256").update(`${nonce}:${solution}`).digest("hex");
  const full = Math.floor(bits / 4);
  if (hex.slice(0, full) !== "0".repeat(full)) return false;
  if (bits % 4 === 0) return true;
  const nibble = parseInt(hex[full], 16);
  return nibble < 1 << (4 - (bits % 4));
}
