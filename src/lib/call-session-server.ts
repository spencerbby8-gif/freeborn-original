import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { callSessions, profilePhotos, userProfiles } from "@/db/schema";
import { resolvePhotoUrl } from "@/lib/photo-url";

export type CallSessionRow = typeof callSessions.$inferSelect;
export type CallPerson = { id: string; name: string; photo: string };

export function isCallSessionLive(row: CallSessionRow): boolean {
  return row.status !== "ended" && row.expiresAt.getTime() > Date.now();
}

export function isCallParticipant(row: CallSessionRow, memberId: string): boolean {
  return row.callerId === memberId || row.calleeId === memberId;
}

async function person(id: string): Promise<CallPerson> {
  const [profile] = await db
    .select({ id: userProfiles.id, name: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, id))
    .limit(1);
  const [photo] = await db
    .select({ path: profilePhotos.storagePath })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(1);
  return { id, name: profile?.name ?? "Freeborn member", photo: resolvePhotoUrl(photo?.path) };
}

/** Both identities come from the database, never from a ring payload. */
export async function callSessionView(row: CallSessionRow, memberId: string) {
  const peerId = row.callerId === memberId ? row.calleeId : row.callerId;
  const [peer, self] = await Promise.all([person(peerId), person(memberId)]);
  return {
    id: row.id,
    matchId: row.matchId,
    kind: row.kind,
    status: row.status,
    callerId: row.callerId,
    calleeId: row.calleeId,
    expiresAt: row.expiresAt.toISOString(),
    peer,
    self,
  };
}

export async function findParticipantSession(id: string, memberId: string) {
  const [row] = await db
    .select()
    .from(callSessions)
    .where(
      and(
        eq(callSessions.id, id),
        or(eq(callSessions.callerId, memberId), eq(callSessions.calleeId, memberId)),
      ),
    )
    .limit(1);
  return row ?? null;
}
