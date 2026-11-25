import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { callSessions, chatSignals, matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUnmatchReason } from "@/lib/match-lifecycle";
import { scheduleChatNotice } from "@/lib/chat-notify";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/unmatch — end a conversation.
 *
 * This used to be `delete(matches)`. Because `messages.match_id` and
 * `chat_media.match_id` are both `on delete cascade`, that single statement destroyed the
 * shared history for BOTH members — unrecoverably, on one person's tap — and left the
 * thread's photo bytes in the `chat-media` bucket attached to nothing, which is the fifth
 * way member media was disappearing (see MEDIA-DISAPPEARANCE-2026-10-30.md and
 * UNMATCH-EVIDENCE.md).
 *
 * It is now an UPDATE: `status='unmatched'` plus who/when/why. The rows survive, the bytes
 * stay reachable by the two people who were in the conversation, and each member's *view* of
 * the thread is decided per member by `src/lib/match-lifecycle.ts`:
 *   - the member who unmatched no longer sees it and cannot reopen it;
 *   - the member who was unmatched keeps reading it, read-only, so they can still report
 *     what happened — which is the reason Bumble documents for retaining it.
 * Account deletion remains the only path allowed to cascade, and it still does.
 *
 * The reason is optional (Bumble offers one, Hinge asks for one). What is NOT optional is the
 * confirmation: `destructive: true` in the payload is required, because this cannot be undone
 * — no app in this study can restore an unmatch, and Freeborn will not pretend otherwise.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { with: otherId, reason, destructive } = (body ?? {}) as {
    with?: string;
    reason?: unknown;
    destructive?: unknown;
  };
  if (!isUuid(otherId) || otherId === member.id) {
    return Response.json({ error: "A valid member is required." }, { status: 400 });
  }
  if (reason !== undefined && reason !== null && reason !== "" && !isUnmatchReason(reason)) {
    return Response.json({ error: "That reason isn't one of ours." }, { status: 400 });
  }
  if (destructive !== true) {
    return Response.json(
      { error: "Unmatching is permanent. Confirm before continuing.", needsConfirmation: true },
      { status: 409 }
    );
  }

  const cleanReason = typeof reason === "string" && reason ? reason : null;
  const now = new Date();

  // Explicit unmatch remains terminal even if a block currently hides the
  // thread. Share the pair lock with block/unblock so unblock cannot later
  // reactivate a match that either member deliberately ended.
  const updated = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${otherId}::text) || ':' || greatest(${member.id}::text, ${otherId}::text), 0))`);
    const [row] = await tx.update(matches)
      .set({ status: "unmatched", unmatchedBy: member.id, unmatchedAt: now, unmatchReason: cleanReason })
      .where(and(
        or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
        or(eq(matches.userA, otherId), eq(matches.userB, otherId)),
        inArray(matches.status, ["active", "archived", "blocked"])
      )).returning({ id: matches.id, status: matches.status });
    if (row) await tx.update(callSessions).set({status:"ended",endedAt:new Date(),endedBy:null,endReason:"unavailable"}).where(and(eq(callSessions.matchId,row.id),inArray(callSessions.status,["ringing","active"])));
    return row;
  });

  if (!updated) {
    // Either there was never a match, or it was already severed (possibly by the other
    // member). The client's desired end state holds either way, so a repeat call is not an
    // error — but say which happened, because "already ended" and "never matched" are
    // different things to a member who is worried about a scammer.
    const [existing] = await db
      .select({ status: matches.status })
      .from(matches)
      .where(
        or(
          and(eq(matches.userA, member.id), eq(matches.userB, otherId)),
          and(eq(matches.userA, otherId), eq(matches.userB, member.id))
        )
      )
      .limit(1);
    return Response.json(
      existing
        ? { ok: true, unmatched: false, alreadyEnded: true, status: existing.status }
        : { ok: true, unmatched: false, alreadyEnded: false, status: null },
      { status: 200 }
    );
  }

  /* Tell the other member's client, now, that this ended — rather than leaving them staring at
     a thread whose state changed until the next poll. Same best-effort rule as a message
     signal: the UPDATE above is the truth, and it already happened. */
  try {
    await db.insert(chatSignals).values({ matchId: updated.id, kind: "severed" });
  } catch {
    /* notification is an accelerator */
  }
  scheduleChatNotice(request, updated.id, "severed");

  return Response.json({ ok: true, unmatched: true, matchId: updated.id });
}
