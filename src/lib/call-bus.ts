/**
 * FREEBORN CALL BUS — private Supabase Realtime signaling (FB-13).
 *
 * A server-issued call_sessions row is the authority, never a topic name. Ring
 * topics are readable only by their owner; call topics are readable/writable only
 * by the two participants of a live, unblocked, active match. The client refreshes
 * Realtime auth before every join. Media remains peer-to-peer WebRTC.
 */

import { createSupabaseBrowserClient, getAccessToken } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { readJsonSafe } from "@/lib/api-response";

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type CallIceConfig = RTCConfiguration & {
  relayConfigured: boolean;
  relayStatus: "unconfigured" | "configured-unverified" | "cloudflare-live" | "unavailable";
  relayProvider?: "cloudflare" | "coturn";
  credentialExpiresAt?: number;
  credentialTtlSeconds?: number;
};

export type CallPerson = { id: string; name: string; photo: string };
export type CallSession = {
  id: string;
  matchId: string;
  kind: "voice" | "video";
  status: "ringing" | "active" | "ended";
  callerId: string;
  calleeId: string;
  expiresAt: string;
  endedBy?: string|null;
  endReason?: string|null;
  peer: CallPerson;
  self: CallPerson;
};

/**
 * Every call API request carries the member's own Bearer token.
 *
 * WHY THIS IS EXPLICIT (owner report B11, "the call never reaches the other
 * user"): these fetches used to send Content-Type and nothing else. This app
 * keeps its Supabase session in localStorage rather than cookies - see
 * src/lib/supabase/browser.ts, deliberate, so the app still authenticates
 * inside a cross-site iframe where third-party cookies are blocked - so the
 * server's cookie fallback in src/lib/supabase/api-auth.ts had nothing to read
 * and getMember() returned null.
 *
 * Measured live on a preview with two real matched members:
 *   POST /api/calls/session -> 401 {"error":"Not signed in."}
 * The caller was told "Call again", while the callee's ring channel had joined
 * perfectly (Realtime phx_reply status "ok" on realtime:fb-ring:<calleeId>) and
 * simply never had anything to ring about. A call cannot reach anybody if it is
 * never allowed to start. Every other API caller in this app sends the token;
 * the call bus was the one that forgot.
 */
async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getAccessToken().catch(() => null);
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(extra ?? {}) };
}

async function sessionRequest(path: string, init?: RequestInit): Promise<CallSession> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: await authHeaders({
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    }),
  });
  const json = await readJsonSafe<CallSession & { error?: string }>(res);
  if (!res.ok || !json?.id) throw new Error(json?.error ?? "This call isn't available.");
  return json;
}

export function createCallSession(matchId: string, kind: "voice" | "video") {
  return sessionRequest("/api/calls/session", { method: "POST", body: JSON.stringify({ matchId, kind }) });
}

export function getCallSession(callId: string) {
  return sessionRequest(`/api/calls/session/${encodeURIComponent(callId)}`);
}

export function updateCallSession(callId: string, action: "accept" | "decline" | "end") {
  return sessionRequest(`/api/calls/session/${encodeURIComponent(callId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

/** No credential cache across calls; an ICE restart can fetch a fresh grant. */
export async function getIceConfig(callId: string): Promise<CallIceConfig> {
  try {
    const res = await fetch(`/api/calls/ice?callId=${encodeURIComponent(callId)}`, {
      cache: "no-store",
      headers: await authHeaders(),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
      throw new Error("This call isn't available.");
    }
    const json = await readJsonSafe<CallIceConfig>(res);
    if (res.ok && json && Array.isArray(json.iceServers) && json.iceServers.length > 0) {
      return { ...json, relayConfigured: json.relayConfigured === true };
    }
  } catch (err) {
    if (err instanceof Error && err.message === "This call isn't available.") throw err;
  }
  return { ...ICE_SERVERS, relayConfigured: false, relayStatus: "unavailable" };
}

export type RingPayload = {
  callId: string;
  matchId: string;
  kind: "voice" | "video";
  from: CallPerson;
};

export type CallSignal =
  | { t: "accept" }
  | { t: "declined" }
  | { t: "busy" }
  | { t: "hangup" }
  | { t: "ping" }
  | { t: "sdp"; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; cand: RTCIceCandidateInit };

async function privateCallChannel(topic: string): Promise<RealtimeChannel> {
  const client = createSupabaseBrowserClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("Not signed in.");
  // No argument keeps the client's callback-based token mode, so heartbeats can
  // refresh authorization instead of pinning a one-hour manual JWT forever.
  await client.realtime.setAuth();
  return client.channel(topic, { config: { private: true, broadcast: { self: false, ack: true } } });
}

export function ringChannel(userId: string): Promise<RealtimeChannel> {
  return privateCallChannel(`fb-ring:${userId}`);
}

export function callChannel(callId: string): Promise<RealtimeChannel> {
  return privateCallChannel(`fb-call:${callId}`);
}

/** Fire-and-forget trace entry — never part of the authorization decision. */
export function traceCall(callId: string, role: string, event: string, info?: string) {
  try {
    void (async () => {
      await fetch("/api/calls/trace", {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ callId, role, event, info }),
      });
    })().catch(() => undefined);
  } catch {
    /* tracing must never break a call */
  }
}

/**
 * The member's live incoming ring, PULLED rather than pushed.
 *
 * The broadcast ring is the fast path, but a Realtime broadcast is
 * fire-and-forget: the server accepts it whether or not anybody is subscribed,
 * so a callee whose socket is mid-reconnect, whose tab was just restored, or
 * whose app has only just opened never hears it - and nothing ever sends it
 * again. The caller's trace still records a successful tx-ring, which is how a
 * lost ring becomes "the call never came through" with no error anywhere.
 *
 * The chat path already learned this lesson and keeps a poll as the floor
 * (db/migrations/2026-10-30-chat-signals.sql: "the HTTP fetch stays
 * authoritative and the poll stays as the floor"). This is the same floor for
 * calls, and it needs no Realtime at all.
 */
export async function getIncomingCall(): Promise<CallSession | null> {
  try {
    const res = await fetch("/api/calls/session", { cache: "no-store", headers: await authHeaders() });
    if (!res.ok) return null;
    const json = await readJsonSafe<{ incoming: CallSession | null }>(res);
    return json?.incoming ?? null;
  } catch {
    return null;
  }
}

export function destroyChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  try {
    createSupabaseBrowserClient().removeChannel(channel);
  } catch {
    try { channel.unsubscribe(); } catch { /* already gone */ }
  }
}

/** Retry briefly, never forever: a denied private channel must not spin. */
export function publish(channel: RealtimeChannel, event: string, payload: unknown) {
  const deadline = Date.now() + 10_000;
  const attempt = () => {
    const state = channel.state as string;
    if (state === "joined" || state === "SUBSCRIBED") {
      void channel.send({ type: "broadcast", event, payload });
    } else if (Date.now() < deadline) {
      setTimeout(attempt, 250);
    }
  };
  attempt();
}
