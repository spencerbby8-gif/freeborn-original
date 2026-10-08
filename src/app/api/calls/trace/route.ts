/**
 * Call tracing — the end-to-end black box.
 * Every signaling step POSTs here; after a failed call the trace shows
 * exactly where it died (ring? accept? offer? answer? ICE? relay?).
 * In-memory, capped, no personal data beyond the call id and role.
 */

export const dynamic = "force-dynamic";

type TraceEntry = { at: string; callId: string; role: string; event: string; info?: string };

const buffer: TraceEntry[] = [];
const MAX = 600;

export async function POST(request: Request) {
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
  buffer.push({
    at: new Date().toISOString(),
    callId: String(callId).slice(0, 60),
    role: String(role ?? "?").slice(0, 12),
    event: String(event).slice(0, 60),
    info: info ? String(info).slice(0, 220) : undefined,
  });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("callId");
  const entries = callId ? buffer.filter((e) => e.callId === callId) : buffer.slice(-200);
  return Response.json({ entries });
}
