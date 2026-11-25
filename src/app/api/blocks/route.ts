import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/blocks — the member's blocked list (for the privacy manager).
 * Only the blocked member's public card info is returned — never the
 * blocker's own private data, and blocked members are not notified.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const rows = await db
    .select({
      blockedId: blockedUsers.blockedId,
      blockedAt: blockedUsers.createdAt,
      displayName: userProfiles.displayName,
      city: userProfiles.city,
    })
    .from(blockedUsers)
    .innerJoin(userProfiles, eq(userProfiles.id, blockedUsers.blockedId))
    .where(eq(blockedUsers.blockerId, member.id))
    .orderBy(desc(blockedUsers.createdAt));

  const out = [];
  for (const row of rows) {
    const [photo] = await db
      .select({ storagePath: profilePhotos.storagePath })
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, row.blockedId))
      .orderBy(profilePhotos.position)
      .limit(1);
    out.push({
      id: row.blockedId,
      name: row.displayName ?? "Member",
      city: row.city ?? "",
      photo: photo ? resolvePhotoUrl(photo.storagePath) : "",
      blockedAt: row.blockedAt,
    });
  }

  return Response.json({ blocked: out });
}

/**
 * POST /api/blocks — block a member.
 * They vanish from discovery (both directions), and any match/conversation
 * between the two is removed immediately so neither side can reach the other.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { profileId, reason } = (body ?? {}) as { profileId?: string; reason?: string };
  if (!profileId || profileId === member.id) {
    return Response.json({ error: "A valid member is required." }, { status: 400 });
  }

  // Serialize both directions of block/unblock for this pair. The block row and
  // the preserved match transition must commit together or not at all.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${profileId}::text) || ':' || greatest(${member.id}::text, ${profileId}::text), 0))`);
    await tx.insert(blockedUsers)
      .values({ blockerId: member.id, blockedId: profileId, reason: reason ?? null })
      .onConflictDoNothing();
    // Preserve the original row, messages and media as safety evidence.
    await tx.update(matches)
      .set({ status: "blocked", unmatchedBy: member.id, unmatchedAt: new Date() })
      .where(and(
        or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
        or(eq(matches.userA, profileId), eq(matches.userB, profileId)),
        eq(matches.status, "active")
      ));
  });

  return Response.json({ ok: true });
}

/**
 * DELETE /api/blocks — unblock a member.
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { profileId } = (body ?? {}) as { profileId?: string };
  if (!profileId) return Response.json({ error: "A valid member is required." }, { status: 400 });

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${profileId}::text) || ':' || greatest(${member.id}::text, ${profileId}::text), 0))`);
    const removed = await tx.delete(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, profileId)))
      .returning({ id: blockedUsers.id });
    if (!removed.length) return;
    const [remaining] = await tx.select({ id: blockedUsers.id }).from(blockedUsers)
      .where(or(
        and(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, profileId)),
        and(eq(blockedUsers.blockerId, profileId), eq(blockedUsers.blockedId, member.id))
      )).limit(1);
    if (remaining) return;
    // Restore only a formerly blocked match, never an explicit unmatch. No
    // history is reconstructed: we reuse the original match ID and records.
    await tx.update(matches)
      .set({ status: "active", unmatchedBy: null, unmatchedAt: null })
      .where(and(
        or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
        or(eq(matches.userA, profileId), eq(matches.userB, profileId)),
        eq(matches.status, "blocked")
      ));
  });

  return Response.json({ ok: true });
}
