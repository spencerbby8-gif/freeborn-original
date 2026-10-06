import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messages, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

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
    type: "match" | "message" | "tip";
    title: string;
    body: string;
    photo?: string;
    at: Date;
    unread: boolean;
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

    items.push({
      id: `match-${m.id}`,
      type: "match",
      title: `New match: ${name}`,
      body: "You liked each other — the conversation is open. Say hello.",
      photo: photo?.storagePath,
      at: m.createdAt,
      unread: false,
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
        photo: photo?.storagePath,
        at: last?.createdAt ?? m.createdAt,
        unread: true,
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
    });
  }

  return Response.json({ notifications: items });
}
