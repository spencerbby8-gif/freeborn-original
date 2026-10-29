import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { humanChallenges } from "@/db/schema";

/**
 * LIVENESS FRESHNESS CHALLENGE — server-side consumption.
 *
 * Scope, stated so it cannot be mistaken for more: this proves the verification
 * attempt was initiated seconds ago by *this* member and is presented exactly
 * once. It does not prove a live human was present; the blink/face checks stay
 * client-asserted (see /api/verification/challenge for the full reasoning).
 */
export type FreshnessState = "verified" | "missing" | "expired" | "replayed" | "foreign";

export interface FreshnessOutcome {
  state: FreshnessState;
  /** Enforcement is deliberately not a flag here: a consumed/absent token never
   *  grants the badge, but the attempt is always still recorded — a blocked
   *  request that leaves no row is how moderation loses its evidence trail. */
  detail: string;
}

const LOOKUP = and(eq(humanChallenges.purpose, "verification"))!;

/**
 * Find the member's live verification challenge and consume it.
 *
 * Consumption is a compare-and-set (`status='issued'` in the WHERE of the UPDATE)
 * so two concurrent submissions cannot both redeem one token — the loser sees
 * `replayed`. That is the entire point of the control, so it is done as one
 * statement rather than read-then-write.
 */
export async function consumeLivenessChallenge(
  email: string,
  tokenId: unknown
): Promise<FreshnessOutcome> {
  if (typeof tokenId !== "string" || !/^[0-9a-f-]{36}$/i.test(tokenId)) {
    return { state: "missing", detail: "no livenessToken supplied" };
  }

  const [row] = await db
    .select({
      id: humanChallenges.id,
      email: humanChallenges.email,
      status: humanChallenges.status,
      expiresAt: humanChallenges.expiresAt,
    })
    .from(humanChallenges)
    .where(and(eq(humanChallenges.id, tokenId), LOOKUP))
    .limit(1);

  if (!row) return { state: "missing", detail: "token not found (or already consumed)" };
  if (String(row.email).toLowerCase() !== email.toLowerCase()) {
    /* Same 404-shaped answer as a replay on purpose: a caller must not learn whether
       someone else's token exists. Logged server-side with the real reason. */
    return { state: "foreign", detail: "token belongs to a different member" };
  }
  if (row.status !== "issued") return { state: "replayed", detail: `token status=${row.status}` };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    await db
      .update(humanChallenges)
      .set({ status: "expired" })
      .where(and(eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued")));
    return { state: "expired", detail: "issued more than the TTL ago" };
  }

  const [consumed] = await db
    .update(humanChallenges)
    .set({ status: "solved", solvedAt: new Date() })
    .where(and(eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued")))
    .returning({ id: humanChallenges.id });

  if (!consumed) return { state: "replayed", detail: "lost the consume race" };
  return { state: "verified", detail: "single-use token consumed by this member" };
}

/** Suffix written into `verification_requests.method`, so the audit row says which
 *  freshness path the decision came through. Never inferred from the badge alone. */
export function freshnessTag(state: FreshnessState): string {
  return state === "verified" ? "+fresh" : `+fresh:${state}`;
}
