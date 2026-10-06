import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messages, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const rows = await db
    .select({
      id: matches.id,
      userA: matches.userA,
      userB: matches.userB,
      lastMessageAt: matches.lastMessageAt,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .where(or(eq(matches.userA, member.id), eq(matches.userB, member.id)))
    .orderBy(desc(matches.lastMessageAt));

  const out = [];
  for (const row of rows) {
    const otherId = row.userA === member.id ? row.userB : row.userA;
    const [other] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, otherId))
      .limit(1);
    if (!other) continue;

    const [photo] = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, otherId))
      .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
      .limit(1);

    const [last] = await db
      .select({ body: messages.body, senderId: messages.senderId, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.matchId, row.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    const [{ unread }] = await db
      .select({
        unread: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.matchId, row.id),
          eq(messages.senderId, otherId),
          sql`${messages.readAt} is null`
        )
      );

    out.push({
      id: row.id,
      with: {
        id: otherId,
        name: other.displayName ?? "Member",
        city: other.city ?? "",
        photo: photo?.storagePath ?? "",
      },
      lastMessage: last
        ? {
            body: last.body,
            mine: last.senderId === member.id,
            at: last.createdAt,
          }
        : null,
      unread,
      createdAt: row.createdAt,
    });
  }

  return Response.json({ matches: out });
}
