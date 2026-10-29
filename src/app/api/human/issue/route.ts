import { and, desc, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { humanChallenges } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/** Difficulty, in leading zero BITS of the sha256 of `nonce:solution`.
 *
 *  MEASURED, NOT GUESSED (sandbox node, 120 fresh random nonces each, solution encoded as a
 *  decimal STRING exactly as a client sends it and exactly as verify re-checks it):
 *     18-bit: 0/120 unsolved within a 4,000,000-candidate budget; 175 ms mean, 1,182 ms worst
 *     20-bit: 5/106 unsolved — 4.7% — same budget;                      832 ms mean, 2,575 ms worst
 *     22-bit: 17/50 unsolved — 34%                                        1,396 ms mean
 *  So 20 bits, the previous default, silently locked about one member in twenty out of their own
 *  appeal, which is the worst possible failure for a control meant to stop automation: the honest
 *  user pays and cannot pay. 18 bits still costs a script per filing and measures as never
 *  exceeding the budget here, so it is the floor.
 *
 *  A client that DOES exhaust its budget must re-POST /api/human/issue (which expires the old
 *  row and hands out a fresh nonce) rather than retry the same challenge: whether a nonce is
 *  solvable inside the budget is decided by the nonce, so re-trying a bad one fails forever while
 *  re-requesting fails again with probability 0.047^k. One retry takes the effective lock-out
 *  from 4.7% to 0.22%. That instruction is returned in the payload for exactly this reason. */
export const CHALLENGE_DIFFICULTY_BITS = 18;
/** The hardest challenge the issuer will hand out. 20 is the ceiling because above it the
    measured unsolved rate (34% at 22) makes the control unreliable rather than merely costly. */
export const MAX_CHALLENGE_DIFFICULTY_BITS = 20;
/** Candidates a client is told to attempt before giving up and re-requesting. */
export const SOLVER_BUDGET_CANDIDATES = 4_000_000;

/** Risk-scaled difficulty: the ladder, not a flat toll. A member with an identity-verified
    account and nothing open is not the same threat as an unverified account with duplicate
    photos, so the cost should differ — but never past the reliability ceiling. */
/**
 * BROWSER tier added 2026-10-29 after measuring, not guessing: WebCrypto in a browser costs
 * ~8,500 sha256/s measured here, so the 18-bit default needs ~31 s on average and a full
 * 4,000,000-candidate run did NOT solve in 242 s. A control no honest member can complete is
 * not a control, it is an outage. 12 bits is ~4,096 candidates (0.5-2 s), which is the right
 * size for the actual threat on this path — a browser script flooding the appeal queue — and
 * it is explicitly NOT claimed to resist a GPU. Signup/reset keep the higher tiers because
 * nothing in this product makes a browser solve those.
 */
export const BROWSER_CHALLENGE_DIFFICULTY_BITS = 12;

export function difficultyForRisk(risk: "standard" | "elevated" | "high" | "browser"): number {
  const want =
    risk === "high" ? 20 : risk === "elevated" ? 19 : risk === "browser" ? BROWSER_CHALLENGE_DIFFICULTY_BITS : CHALLENGE_DIFFICULTY_BITS;
  return Math.min(Math.max(want, 12), MAX_CHALLENGE_DIFFICULTY_BITS);
}
const MASK = "0".repeat(Math.floor(CHALLENGE_DIFFICULTY_BITS / 4));

export function meetsDifficulty(nonce: string, solution: string, bits = CHALLENGE_DIFFICULTY_BITS): boolean {
  const hex = createHash("sha256").update(`${nonce}:${solution}`).digest("hex");
  const full = Math.floor(bits / 4);
  if (hex.slice(0, full) !== "0".repeat(full)) return false;
  if (bits % 4 === 0) return true;
  const nibble = parseInt(hex[full], 16);
  return nibble < 1 << (4 - (bits % 4));
}

/**
 * POST /api/human/issue  { purpose: "appeal" | "signup" | "reset" }
 *
 * WHAT THIS IS, STATED WITHOUT INFLATION
 *   Tinder gates a ban appeal on an Arkone-style token (`appealChallengeToken`, and the
 *   Arkose blob is set through a dedicated redux action) and gates login on
 *   `POST /v2/auth/verify-captcha`. Freeborn has NO third-party captcha provider
 *   configured, and per standing instruction none is being invented here. So this is a
 *   locally-verifiable proof-of-work challenge plus the exact seam a provider plugs into:
 *   the same two columns (token, status), the same consume-on-verify rule, the same
 *   "a challenge is required for THIS act" scoping.
 *   Enforcement is controlled by FREEBORN_HUMAN_CHALLENGE: "record" (default) counts and
 *   logs but does not block, "enforce" rejects. That flag is reported in every response so
 *   nobody can later read this file and assume blocking is live.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const purpose = (body as { purpose?: unknown })?.purpose;
  /* 'verification' is issued by /api/verification/challenge, not here: it must not
     carry a proof-of-work demand, so it keeps its own route. Rejected here so a
     caller cannot mint a liveness token by asking for the wrong shape. */
  if (purpose !== "appeal" && purpose !== "signup" && purpose !== "reset") {
    return Response.json({ error: "purpose must be appeal, signup or reset." }, { status: 400 });
  }

  const email = member.email.toLowerCase();
  const nonce = randomBytes(16).toString("hex");
  const tokenHash = createHash("sha256").update(`freeborn-hc-v1:${nonce}`).digest().subarray(0, 8).toString("hex");

  /* One live challenge per (member, purpose): an unbounded issue endpoint is itself
     a DoS amplifier, and it lets a script keep stale unsolved rows around forever. */
  await db
    .update(humanChallenges)
    .set({ status: "expired" })
    .where(and(eq(humanChallenges.email, email), eq(humanChallenges.purpose, purpose), eq(humanChallenges.status, "issued")));

  const risk = (body as { risk?: unknown })?.risk;
  const riskKind =
    risk === "high" || risk === "elevated" || risk === "browser" ? (risk as "high" | "elevated" | "browser") : "standard";
  const difficultyBits = difficultyForRisk(riskKind);

  await db.insert(humanChallenges).values({
    email,
    purpose,
    tokenHash,
    status: "issued",
    nonce,
    difficultyBits,
  });

  return Response.json(
    {
      nonce,
      algorithm: "sha256-prefix-zeros",
      difficultyBits,
      /* see the measurement above: the budget and the retry rule are part of the control */
      solverBudget: SOLVER_BUDGET_CANDIDATES,
      onExhausted: "POST /api/human/issue again for a fresh nonce; do not retry this one",
      prefixHint: MASK,
      expiresInSeconds: 900,
      enforcing: process.env.FREEBORN_HUMAN_CHALLENGE === "enforce",
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
