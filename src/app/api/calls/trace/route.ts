/**
 * Call tracing — the end-to-end black box.
 * Every signaling step POSTs here; after a failed call the trace shows
 * exactly where it died (ring? accept? offer? answer? ICE? relay?).
 *
 * ACCESS (audit finding F-G, fixed 2026-10-28)
 * ---------------------------------------------
 * Both methods used to be anonymous. That was wrong twice over: any stranger
 * could read `GET /api/calls/trace` and receive the most recent 200 entries of a
 * buffer shared by every member on that instance — call ids, roles and free-text
 * info from other people's calls — and any stranger could append to that same
 * buffer for nothing. Verified live before the change: HTTP 200 with no session.
 *
 * Both handlers now require a signed-in member, entries are attributed to the
 * member who wrote them, and reads are filtered to that member's own entries.
 * A `callId` is only ever fetched by someone in the call, so membership-based
 * ownership is sufficient — no per-call ACL table was needed.
 *
 * It stays in-memory and capped: a serverless instance has no reason to keep call
 * signalling metadata after it scales down. That is also why the buffer is
 * documented as best-effort rather than a record — the durable record of a call
 * lives in the messages/matches tables, not here.
 */

import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

type TraceEntry = {
  at: string;
  callId: string;
  role: string;
  event: string;
  info?: string;
  memberId: string;
};

const buffer: TraceEntry[] = [];
const MAX = 600;
const MAX_PER_CALL = 40;

export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const { callId, role, event, info } = (body ?? {}) as {
    callId?: string;
    role?: string;
    event?: string;
    info?: string;
  };
  if (!callId || !event) return Response.json({ ok: false }, { status: 400 });

  /* Per-call bound, so one member cannot push 600 entries for a single call id and
     evict everyone else's trace with cheap writes. */
  const forCall = buffer.filter((e) => e.callId === callId).length;
  if (forCall >= MAX_PER_CALL) return Response.json({ ok: true, truncated: true });

  buffer.push({
    at: new Date().toISOString(),
    callId: String(callId).slice(0, 60),
    role: String(role ?? "?").slice(0, 12),
    event: String(event).slice(0, 60),
    info: info ? String(info).slice(0, 220) : undefined,
    memberId: member.id,
  });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  const mine = buffer.filter((e) => e.memberId === member.id);
  const entries = callId ? mine.filter((e) => e.callId === callId) : mine.slice(-200);
  return Response.json({ entries, scopedTo: "self" });
}
