import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, messages, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";

export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Blocked in either direction → the conversation disappears from the list.
  const blockRows = await db
    .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, member.id)));
  const blockedSet = new Set(
    blockRows.map((b) => (b.blockerId === member.id ? b.blockedId : b.blockerId))
  );

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
    if (blockedSet.has(otherId)) continue;
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

    const active =
      other.lastActiveAt != null && Date.now() - other.lastActiveAt.getTime() < 15 * 60 * 1000;
    out.push({
      id: row.id,
      with: {
        id: otherId,
        name: other.displayName ?? "Member",
        city: other.city ?? "",
        photo: resolvePhotoUrl(photo?.storagePath ?? ""),
        active,
        lastActiveAt: other.lastActiveAt ?? null,
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
