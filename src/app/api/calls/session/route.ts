import { and, eq, gt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { callSessions, matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { isBlockedPair } from "@/lib/conversation-access";
import { callSessionView } from "@/lib/call-session-server";
import { decideMatchAccess, type MatchLifecycleStatus } from "@/lib/match-lifecycle";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/** POST /api/calls/session — the only way to mint call-topic authority. */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { matchId, kind } = (body ?? {}) as { matchId?: unknown; kind?: unknown };
  if (!isUuid(matchId) || (kind !== "voice" && kind !== "video")) {
    return Response.json({ error: "A valid match and call kind are required." }, { status: 400 });
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  const participant = Boolean(match && (match.userA === member.id || match.userB === member.id));
  const access = decideMatchAccess({
    status: (match?.status ?? null) as MatchLifecycleStatus | null,
    isParticipant: participant,
    isActor: match?.unmatchedBy === member.id,
    hasMessages: false,
    action: "send_message",
  });
  if (!match || !access.allow) return Response.json({ error: "This call isn't available." }, { status: 403 });
  const calleeId = match.userA === member.id ? match.userB : match.userA;
  if (await isBlockedPair(member.id, calleeId)) {
    return Response.json({ error: "This call isn't available." }, { status: 403 });
  }

  const row = await db.transaction(async (tx) => {
    // Serialize session issuance per member across serverless instances.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${member.id}))`);
    await tx.update(callSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(callSessions.callerId, member.id), eq(callSessions.status, "ringing"), sql`${callSessions.expiresAt} <= now()`));
    const [recent] = await tx.select({ n: sql<number>`count(*)::int` }).from(callSessions)
      .where(and(eq(callSessions.callerId, member.id), gt(callSessions.createdAt, sql`now() - interval '1 minute'`)));
    const [live] = await tx.select({ n: sql<number>`count(*)::int` }).from(callSessions)
      .where(and(or(eq(callSessions.callerId, member.id), eq(callSessions.calleeId, member.id)), sql`${callSessions.status} in ('ringing','active')`, gt(callSessions.expiresAt, sql`now()`)));
    if ((recent?.n ?? 0) >= 5 || (live?.n ?? 0) >= 3) return null;
    const [created] = await tx.insert(callSessions).values({
      matchId,
      callerId: member.id,
      calleeId,
      kind,
      status: "ringing",
      expiresAt: new Date(Date.now() + 2 * 60_000),
    }).returning();
    return created;
  });
  if (!row) return Response.json({ error: "Too many call attempts. Please wait a moment." }, { status: 429 });
  return Response.json(await callSessionView(row, member.id), { headers: { "Cache-Control": "private, no-store" } });
}
