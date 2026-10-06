import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  messages,
  profilePhotos,
  userProfiles,
  userSwipes,
} from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";
import { pickOpener } from "@/lib/chat-personas";

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
    photo: photo?.storagePath ?? "",
    verified: p.isVerified,
  };
}

/** Liked profiles for the signed-in member. */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const rows = await db
    .select({ likedId: userSwipes.likedId, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likerId, member.id), eq(userSwipes.action, "like")))
    .orderBy(desc(userSwipes.createdAt));

  const liked = [];
  for (const row of rows) {
    const card = await profileCard(row.likedId);
    if (card) liked.push({ ...card, likedAt: row.createdAt });
  }
  return Response.json({ liked });
}

/**
 * Swipe. In the preview room, a like forms a match immediately and the other
 * person says hello — so chat can be experienced end to end.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { profileId, choice } = (body ?? {}) as { profileId?: string; choice?: string };
  if (!profileId || (choice !== "like" && choice !== "pass" && choice !== "superlike")) {
    return Response.json(
      { error: "A profile id and a choice of 'like', 'pass', or 'superlike' is required." },
      { status: 400 }
    );
  }

  const target = await getLocalProfile(profileId);
  if (!target) return Response.json({ error: "Profile not found." }, { status: 404 });

  const member = await getMember(request);
  const likerId = member?.id ?? null;
  if (!likerId) return Response.json({ error: "Sign in to record likes." }, { status: 401 });
  if (likerId === profileId)
    return Response.json({ error: "You can't swipe on your own profile." }, { status: 400 });

  await db
    .insert(userSwipes)
    .values({ likerId, likedId: profileId, action: choice })
    .onConflictDoUpdate({
      target: [userSwipes.likerId, userSwipes.likedId],
      set: { action: choice },
    });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, profileId), eq(userSwipes.action, "like")));

  if (choice === "pass") return Response.json({ ok: true, likes: count, matched: false });

  // Preview-room behavior: the like is mutual — create the match + greeting.
  const [userA, userB] = [likerId, profileId].sort();
  const existing = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
    .limit(1);

  let matched = false;
  if (!existing.length) {
    const [match] = await db
      .insert(matches)
      .values({
        userA,
        userB,
        initiatedBy: likerId,
        lastMessageAt: new Date(),
      })
      .returning({ id: matches.id });

    await db.insert(messages).values({
      matchId: match.id,
      senderId: profileId,
      body: pickOpener(target.displayName ?? ""),
    });
    matched = true;
  }

  return Response.json({ ok: true, likes: count, matched });
}
