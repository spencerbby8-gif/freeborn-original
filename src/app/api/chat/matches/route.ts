import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, messages, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { decideMatchAccess, type MatchLifecycleStatus } from "@/lib/match-lifecycle";

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
      status: matches.status,
      unmatchedBy: matches.unmatchedBy,
      unmatchedAt: matches.unmatchedAt,
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

    /* An ended thread is not deleted — it is visible to the member who did NOT end it, so
       they can still read and report what was sent, and hidden from the member who did
       (src/lib/match-lifecycle.ts). Hiding is a list decision, never a data decision. */
    const listed = decideMatchAccess({
      status: row.status as MatchLifecycleStatus,
      isParticipant: true,
      isActor: row.unmatchedBy === member.id,
      hasMessages: true,
      action: "appear_in_chat_list",
    });
    if (!listed.allow) continue;
    const ended = row.status === "unmatched" || row.status === "blocked";
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
    const unreadAllowed = decideMatchAccess({
      status: row.status as MatchLifecycleStatus,
      isParticipant: true,
      isActor: row.unmatchedBy === member.id,
      hasMessages: true,
      action: "count_unread",
    }).allow;

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
      // An ended conversation never nags, but the read state is still recorded underneath.
      unread: unreadAllowed ? unread : 0,
      createdAt: row.createdAt,
      ended,
      endedBy: ended ? (row.unmatchedBy === member.id ? "me" : "them") : null,
      endedAt: ended ? row.unmatchedAt : null,
      readOnly: ended,
      canReport: ended && row.unmatchedBy === member.id ? false : ended,
    });
  }

  return Response.json({ matches: out });
}
