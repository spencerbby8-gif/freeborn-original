import { and, desc, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/db";
import { humanChallenges } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import {
  BROWSER_CHALLENGE_DIFFICULTY_BITS,
  CHALLENGE_DIFFICULTY_BITS,
  MAX_CHALLENGE_DIFFICULTY_BITS,
  SOLVER_BUDGET_CANDIDATES,
} from "@/lib/human-challenge";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/* The measured constants and the one verification predicate now live in
   `@/lib/human-challenge` so this route module exports only its HTTP handler.
   Next 16's generated route-type validator rejects extra named exports. */
function difficultyForRisk(risk: "standard" | "elevated" | "high" | "browser"): number {
  const want =
    risk === "high" ? 20 : risk === "elevated" ? 19 : risk === "browser" ? BROWSER_CHALLENGE_DIFFICULTY_BITS : CHALLENGE_DIFFICULTY_BITS;
  return Math.min(Math.max(want, 12), MAX_CHALLENGE_DIFFICULTY_BITS);
}
const MASK = "0".repeat(Math.floor(CHALLENGE_DIFFICULTY_BITS / 4));

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
