import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { callSessions } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { callSessionView, findParticipantSession, isCallSessionLive } from "@/lib/call-session-server";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { badIdResponse, isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return badIdResponse();
  const row = await findParticipantSession(id, member.id);
  if (!row) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!isCallSessionLive(row)) return Response.json({ error: "This call has expired." }, { status: 410 });
  return Response.json(await callSessionView(row, member.id), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const { id } = await context.params;
  if (!isUuid(id)) return badIdResponse();
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = (body as { action?: unknown } | null)?.action;
  if (action !== "accept" && action !== "decline" && action !== "end") {
    return Response.json({ error: "Unknown call action." }, { status: 400 });
  }
  const row = await findParticipantSession(id, member.id);
  if (!row) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!isCallSessionLive(row)) return Response.json({ error: "This call has expired." }, { status: 410 });
  if (action !== "end" && row.calleeId !== member.id) {
    return Response.json({ error: "Only the receiving member can answer this call." }, { status: 403 });
  }

  const nextStatus = action === "accept" ? "active" : "ended";
  const [updated] = await db.update(callSessions).set({
    status: nextStatus,
    ...(action === "accept"
      ? { expiresAt: new Date(Date.now() + 4 * 60 * 60_000) }
      : { endedAt: new Date() }),
  }).where(and(
    eq(callSessions.id, id),
    inArray(callSessions.status, action === "end" ? ["ringing", "active"] : ["ringing"]),
  )).returning();
  if (!updated) return Response.json({ error: "This call is no longer waiting." }, { status: 409 });
  return Response.json(await callSessionView(updated, member.id), { headers: { "Cache-Control": "private, no-store" } });
}
