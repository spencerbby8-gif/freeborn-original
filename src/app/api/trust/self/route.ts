import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userTrustHistory } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { computeTrustScore, memberVisibleFactors } from "@/lib/trust-score";
import { recomputeTrust } from "@/lib/identity-resolve";

export const dynamic = "force-dynamic";

/**
 * GET /api/trust/self — your own trust score and the reasons behind it.
 *
 * WHY THIS EXISTS
 *   A score a member cannot see is a rumour. Tinder surfaces `user-insights` and lets a
 *   member DELETE an insight (`DELETE /v1/user-insights/{id}`); the honest floor for
 *   Freeborn is: show the number, show the factors that are safe to name, and say which
 *   ones we deliberately withhold. Investigation-shaped factors (who else shares your
 *   device, which accounts reuse your photos) are NOT returned to the subject — naming
 *   them tips off exactly the behaviour we want to see again.
 *
 * Only the caller's own row is ever readable; there is no lookup by id.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { signals, score, band } = await recomputeTrust(member.id);
  const result = computeTrustScore(signals);

  const [hist] = await db
    .select({ updatedAt: userTrustHistory.updatedAt })
    .from(userTrustHistory)
    .where(eq(userTrustHistory.userId, member.id))
    .limit(1);

  return Response.json(
    {
      score,
      band,
      risk: result.risk,
      factors: memberVisibleFactors(result.factors),
      withheld: result.factors.length - memberVisibleFactors(result.factors).length,
      computedAt: hist?.updatedAt ?? new Date(),
      /* Say what the score does and does not do. It sets review priority and,
         at the suppression tier, visibility. It never ends an account. */
      effect: "review_priority_and_visibility_only",
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
