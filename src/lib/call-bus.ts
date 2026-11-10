/**
 * FREEBORN CALL BUS — private Supabase Realtime signaling (FB-13).
 *
 * A server-issued call_sessions row is the authority, never a topic name. Ring
 * topics are readable only by their owner; call topics are readable/writable only
 * by the two participants of a live, unblocked, active match. The client refreshes
 * Realtime auth before every join. Media remains peer-to-peer WebRTC.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  peer: CallPerson;
  self: CallPerson;
};

async function sessionRequest(path: string, init?: RequestInit): Promise<CallSession> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
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
    const res = await fetch(`/api/calls/ice?callId=${encodeURIComponent(callId)}`, { cache: "no-store" });
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
    void fetch("/api/calls/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, role, event, info }),
    }).catch(() => undefined);
  } catch {
    /* tracing must never break a call */
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
