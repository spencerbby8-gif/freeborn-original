/**
 * FREEBORN CALL BUS — real device-to-device signaling over Supabase Realtime.
 *
 * Ringing travels on the CALLEE's personal ring channel (fb-ring:<userId>).
 * Once accepted, media signaling (SDP offers/answers + ICE candidates)
 * travels on the match's call channel (fb-call:<matchId>).
 *
 * The audio/video itself flows peer-to-peer via WebRTC (STUN-assisted) —
 * Supabase only carries the handshake.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { readJsonSafe } from "@/lib/api-response";

/** Fallback (STUN-only) — used only if the ICE endpoint is unreachable. */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

let iceCache: RTCConfiguration | null = null;

/** Fetch the real ICE config (STUN + TURN relay). TURN is what makes calls
    connect on mobile carrier networks — STUN alone silently fails there. */
export async function getIceConfig(): Promise<RTCConfiguration> {
  if (iceCache) return iceCache;
  try {
    const res = await fetch("/api/calls/ice", { cache: "no-store" });
    if (!res.ok) return ICE_SERVERS;
    // readJsonSafe, not res.json(): a 502 from the proxy is an HTML page, and a
    // SyntaxError thrown here would be caught by the block below and silently downgrade
    // every call to STUN-only — which fails on carrier networks without saying so.
    const json = (await readJsonSafe<RTCConfiguration>(res)) as RTCConfiguration | null;
    if (json && Array.isArray(json.iceServers) && json.iceServers.length > 0) {
      iceCache = json;
      return json;
    }
    return ICE_SERVERS;
  } catch {
    return ICE_SERVERS;
  }
}

export type RingPayload = {
  callId: string;
  matchId: string;
  kind: "voice" | "video";
  from: { id: string; name: string; photo: string };
};

export type CallSignal =
  | { t: "accept" }
  | { t: "declined" }
  | { t: "busy" }
  | { t: "hangup" }
  | { t: "ping" }
  | { t: "sdp"; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; cand: RTCIceCandidateInit };

export function newCallId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ringChannel(userId: string): RealtimeChannel {
  return createSupabaseBrowserClient().channel(`fb-ring:${userId}`);
}

/** One channel PER CALL (unique callId) — reusing channels between calls is
    what made second attempts never ring. */
export function callChannel(callId: string): RealtimeChannel {
  return createSupabaseBrowserClient().channel(`fb-call:${callId}`);
}

/** Fire-and-forget trace entry — the end-to-end call black box. */
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

/** Full teardown: unsubscribes AND removes every listener + the cached
    channel, so no stale handlers leak into the next call. */
export function destroyChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  try {
    createSupabaseBrowserClient().removeChannel(channel);
  } catch {
    try {
      channel.unsubscribe();
    } catch {
      /* already gone */
    }
  }
}

/** Send a broadcast payload once the channel is subscribed (with retries). */
export function publish(channel: RealtimeChannel, event: string, payload: unknown) {
  const attempt = () => {
    const state = channel.state as string;
    if (state === "joined" || state === "SUBSCRIBED") {
      void channel.send({ type: "broadcast", event, payload });
    } else {
      setTimeout(attempt, 250);
    }
  };
  attempt();
}
