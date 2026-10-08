import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { resolvePhotoUrl } from "@/lib/photo-url";
import {
  blockedUsers,
  matches,
  profilePhotos,
  userProfiles,
  userSwipes,
} from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";

async function profileCard(id: string) {
  const p = await getLocalProfile(id);
  if (!p) return null;
  const [photo] = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(1);
  return {
    id: p.id,
    name: p.displayName ?? "Member",
    city: p.city ?? "",
    photo: resolvePhotoUrl(photo?.storagePath ?? ""),
    verified: p.isVerified,
  };
}

/**
 * GET /api/likes
 * Returns both sides of the member's activity — honestly:
 *  - liked:    profiles this member liked (with when)
 *  - likedYou: profiles that liked THIS member (the #1 demanded feature the
 *              competitors never built), each flagged with match state.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Blocked either way → invisible in both lists.
  const blockRows = await db
    .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, member.id)));
  const blockedSet = new Set(
    blockRows.map((b) => (b.blockerId === member.id ? b.blockedId : b.blockerId))
  );

  const myRows = await db
    .select({ likedId: userSwipes.likedId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likerId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt));

  const liked = [];
  for (const row of myRows) {
    if (blockedSet.has(row.likedId)) continue;
    const card = await profileCard(row.likedId);
    if (card) liked.push({ ...card, superlike: row.action === "superlike", likedAt: row.createdAt });
  }

  const theirRows = await db
    .select({ likerId: userSwipes.likerId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt));

  const likedYou = [];
  for (const row of theirRows) {
    if (blockedSet.has(row.likerId)) continue;
    const card = await profileCard(row.likerId);
    if (!card) continue;
    const [userA, userB] = [member.id, row.likerId].sort();
    const [match] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
      .limit(1);
    likedYou.push({
      ...card,
      superlike: row.action === "superlike",
      likedAt: row.createdAt,
      matched: Boolean(match),
      matchId: match?.id ?? null,
    });
  }

  return Response.json({ liked, likedYou });
}

/**
 * POST /api/likes — record a real swipe.
 * A match is created ONLY when the feeling is genuinely mutual (the other
 * member actually liked back). No fake reciprocity, ever.
 * Also accepts { action: "reset-passes" } to bring passed profiles back
 * on purpose — recycling is never silent.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Sign in to record likes." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const payload = (body ?? {}) as { profileId?: string; choice?: string; action?: string };

  /* Deliberate pass-reset: members choose to see passed people again. */
  if (payload.action === "reset-passes") {
    const removed = await db
      .delete(userSwipes)
      .where(and(eq(userSwipes.likerId, member.id), eq(userSwipes.action, "pass")))
      .returning({ likedId: userSwipes.likedId });
    return Response.json({ ok: true, reset: removed.length });
  }

  /* Unlike — recourse for accidental taps (a trap users raged about on the
     other platforms). */
  if (payload.action === "unlike") {
    const { profileId: targetId } = payload;
    if (!targetId) return Response.json({ error: "A profile id is required." }, { status: 400 });
    await db
      .delete(userSwipes)
      .where(and(eq(userSwipes.likerId, member.id), eq(userSwipes.likedId, targetId)));
    return Response.json({ ok: true });
  }

  const { profileId, choice } = payload;
  if (!profileId || (choice !== "like" && choice !== "pass" && choice !== "superlike")) {
    return Response.json(
      { error: "A profile id and a choice of 'like', 'pass', or 'superlike' is required." },
      { status: 400 }
    );
  }

  const target = await getLocalProfile(profileId);
  if (!target) return Response.json({ error: "Profile not found." }, { status: 404 });
  if (member.id === profileId)
    return Response.json({ error: "You can't swipe on your own profile." }, { status: 400 });

  // Blocked in either direction → no interaction at all.
  const [block] = await db
    .select({ id: blockedUsers.id })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, profileId)),
        and(eq(blockedUsers.blockerId, profileId), eq(blockedUsers.blockedId, member.id))
      )
    )
    .limit(1);
  if (block) return Response.json({ error: "Not available." }, { status: 403 });

  await db
    .insert(userSwipes)
    .values({ likerId: member.id, likedId: profileId, action: choice })
    .onConflictDoUpdate({
      target: [userSwipes.likerId, userSwipes.likedId],
      set: { action: choice, createdAt: new Date() },
    });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, profileId), eq(userSwipes.action, "like")));

  if (choice === "pass") return Response.json({ ok: true, likes: count, matched: false });

  /* Genuine mutuality check: did THEY like us back? */
  const [backSwipe] = await db
    .select({ action: userSwipes.action })
    .from(userSwipes)
    .where(
      and(
        eq(userSwipes.likerId, profileId),
        eq(userSwipes.likedId, member.id),
        inArray(userSwipes.action, ["like", "superlike"])
      )
    )
    .limit(1);

  if (!backSwipe) return Response.json({ ok: true, likes: count, matched: false });

  const [userA, userB] = [member.id, profileId].sort();
  const existing = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
    .limit(1);

  let matched = false;
  if (!existing.length) {
    await db.insert(matches).values({
      userA,
      userB,
      initiatedBy: member.id,
      lastMessageAt: new Date(),
    });
    matched = true;
  } else {
    matched = true;
  }

  return Response.json({ ok: true, likes: count, matched });
}
