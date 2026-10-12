import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";

export const dynamic = "force-dynamic";

/**
 * GET /api/blocks — the member's blocked list (for the privacy manager).
 * Only the blocked member's public card info is returned — never the
 * blocker's own private data, and blocked members are not notified.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

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

  await db
    .insert(blockedUsers)
    .values({ blockerId: member.id, blockedId: profileId, reason: reason ?? null })
    .onConflictDoNothing();

  // Sever any existing match + conversation (messages cascade).
  await db
    .delete(matches)
    .where(
      and(
        eq(matches.userA, member.id),
        eq(matches.userB, profileId)
      )
    );
  await db
    .delete(matches)
    .where(
      and(
        eq(matches.userA, profileId),
        eq(matches.userB, member.id)
      )
    );

  return Response.json({ ok: true });
}

/**
 * DELETE /api/blocks — unblock a member.
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { profileId } = (body ?? {}) as { profileId?: string };
  if (!profileId) return Response.json({ error: "A valid member is required." }, { status: 400 });

  await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, profileId)));

  return Response.json({ ok: true });
}
