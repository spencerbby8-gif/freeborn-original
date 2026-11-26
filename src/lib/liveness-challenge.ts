import { and, eq, sql } from "drizzle-orm";
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
 * A row lock is acquired before the database clock is checked. A time predicate
 * evaluated before waiting on a lock is not enough: an unchanged row can expire
 * while an UPDATE waits. The conditional write then also keeps single-use semantics.
 */
export async function consumeLivenessChallenge(
  email: string,
  tokenId: unknown
): Promise<FreshnessOutcome> {
  if (typeof tokenId !== "string" || !/^[0-9a-f-]{36}$/i.test(tokenId)) {
    return { state: "missing", detail: "no livenessToken supplied" };
  }

  return db.transaction(async tx => {
    const [row] = await tx
      .select({ id: humanChallenges.id, email: humanChallenges.email, status: humanChallenges.status })
      .from(humanChallenges)
      .where(and(eq(humanChallenges.id, tokenId), LOOKUP))
      .limit(1)
      .for("update");

    if (!row) return { state: "missing", detail: "token not found (or already consumed)" };
    if (String(row.email).toLowerCase() !== email.toLowerCase()) {
      return { state: "foreign", detail: "token belongs to a different member" };
    }
    if (row.status !== "issued") return { state: "replayed", detail: `token status=${row.status}` };

    // clock_timestamp(), unlike transaction now(), advances while waiting for a lock.
    // The schema requires an expiry; retaining legacy NULL behavior avoids a silent
    // policy change for an older database that might still contain NULL values.
    const [consumed] = await tx.update(humanChallenges)
      .set({ status: "solved", solvedAt: sql`clock_timestamp()` })
      .where(and(
        eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued"),
        sql`(${humanChallenges.expiresAt} is null or ${humanChallenges.expiresAt} > clock_timestamp())`
      ))
      .returning({ id: humanChallenges.id });
    if (consumed) return { state: "verified", detail: "single-use token consumed by this member" };

    await tx.update(humanChallenges).set({ status: "expired" }).where(and(
      eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued"),
      sql`${humanChallenges.expiresAt} <= clock_timestamp()`
    ));
    return { state: "expired", detail: "issued more than the TTL ago" };
  });
}

/** Suffix written into `verification_requests.method`, so the audit row says which
 *  freshness path the decision came through. Never inferred from the badge alone. */
export function freshnessTag(state: FreshnessState): string {
  return state === "verified" ? "+fresh" : `+fresh:${state}`;
}
