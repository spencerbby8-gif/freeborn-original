import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  messages,
  profilePhotos,
  userProfiles,
  userSwipes,
  verificationRequests,
} from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";

/**
 * Alerts for the signed-in member: matches, unread messages (deep-linking
 * straight into the right conversation), and verification status updates.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const myMatches = await db
    .select()
    .from(matches)
    .where(or(eq(matches.userA, member.id), eq(matches.userB, member.id)))
    .orderBy(desc(matches.createdAt));

  const items: Array<{
    id: string;
    type: "match" | "message" | "like" | "verification" | "tip";
    title: string;
    body: string;
    photo?: string;
    at: Date;
    unread: boolean;
    href: string;
  }> = [];

  for (const m of myMatches) {
    const otherId = m.userA === member.id ? m.userB : m.userA;
    const [other] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, otherId))
      .limit(1);
    const [photo] = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, otherId))
      .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
      .limit(1);
    const name = other?.displayName ?? "Someone";
    const href = `/app/chat?match=${m.id}`;

    items.push({
      id: `match-${m.id}`,
      type: "match",
      title: `New match: ${name}`,
      body: "You liked each other — the conversation is open. Say hello.",
      photo: resolvePhotoUrl(photo?.storagePath ?? ""),
      at: m.createdAt,
      unread: false,
      href,
    });

    const [{ unread }] = await db
      .select({ unread: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.matchId, m.id),
          eq(messages.senderId, otherId),
          sql`${messages.readAt} is null`
        )
      );

    if (unread > 0) {
      const [last] = await db
        .select({ body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.matchId, m.id), eq(messages.senderId, otherId)))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      items.push({
        id: `msg-${m.id}`,
        type: "message",
        title: `${name} sent you a message`,
        body: last?.body ?? "",
        photo: resolvePhotoUrl(photo?.storagePath ?? ""),
        at: last?.createdAt ?? m.createdAt,
        unread: true,
        href,
      });
    }
  }

  /* "Someone liked you — and you can see WHO." The most-demanded feature
     the competitors never built. */
  const incomingLikes = await db
    .select({ likerId: userSwipes.likerId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt))
    .limit(20);
  for (const like of incomingLikes) {
    const [liker] = await db
      .select({ id: userProfiles.id, displayName: userProfiles.displayName })
      .from(userProfiles)
      .where(eq(userProfiles.id, like.likerId))
      .limit(1);
    if (!liker) continue;
    const [likerPhoto] = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, like.likerId))
      .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
      .limit(1);
    items.push({
      id: `like-${liker.id}-${like.createdAt.getTime()}`,
      type: "like",
      title: `${liker.displayName ?? "Someone"} liked you${like.action === "superlike" ? " (Super Like)" : ""}`,
      body: "Open the Likes tab to see who and like them back.",
      photo: resolvePhotoUrl(likerPhoto?.storagePath ?? ""),
      at: like.createdAt,
      unread: false,
      href: "/app/likes",
    });
  }

  // Verification engine alerts
  const [latestVerify] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.accountId, member.id))
    .orderBy(desc(verificationRequests.submittedAt))
    .limit(1);
  if (latestVerify) {
    if (latestVerify.status === "approved") {
      items.push({
        id: `verify-${latestVerify.id}`,
        type: "verification",
        title: "You're verified",
        body: "Your identity check passed — the teal seal is live on your profile.",
        at: latestVerify.reviewedAt ?? latestVerify.submittedAt,
        unread: false,
        href: "/app/profile",
      });
    } else if (latestVerify.status === "pending") {
      items.push({
        id: `verify-${latestVerify.id}`,
        type: "verification",
        title: "Verification in review",
        body: "Your selfie is being checked. It completes shortly in this preview room.",
        at: latestVerify.submittedAt,
        unread: false,
        href: "/app/profile",
      });
    }
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  if (items.length === 0) {
    items.push({
      id: "tip-1",
      type: "tip",
      title: "Welcome to Freeborn",
      body: "Like someone in Discover and the room opens up — matches and messages land here.",
      at: new Date(),
      unread: false,
      href: "/app",
    });
  }

  return Response.json({ notifications: items });
}
