import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, userSwipes } from "@/db/schema";

const LIKE_ACTIONS = new Set(["like", "superlike"]);

/** True when either member has blocked the other. Blocks are bilateral for access. */
export async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, a), eq(blockedUsers.blockedId, b)),
        and(eq(blockedUsers.blockerId, b), eq(blockedUsers.blockedId, a))
      )
    )
    .limit(1);
  return Boolean(row);
}

/** A conversation requires reciprocal interest, not a one-sided start. */
export async function hasMutualLike(a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ likerId: userSwipes.likerId, likedId: userSwipes.likedId, action: userSwipes.action })
    .from(userSwipes)
    .where(
      or(
        and(eq(userSwipes.likerId, a), eq(userSwipes.likedId, b)),
        and(eq(userSwipes.likerId, b), eq(userSwipes.likedId, a))
      )
    );
  const ab = rows.some((r) => r.likerId === a && r.likedId === b && LIKE_ACTIONS.has(r.action));
  const ba = rows.some((r) => r.likerId === b && r.likedId === a && LIKE_ACTIONS.has(r.action));
  return ab && ba;
}
