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

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export type RingPayload = {
  matchId: string;
  kind: "voice" | "video";
  from: { id: string; name: string; photo: string };
};

export type CallSignal =
  | { t: "accept" }
  | { t: "declined" }
  | { t: "busy" }
  | { t: "hangup" }
  | { t: "sdp"; sdp: RTCSessionDescriptionInit }
  | { t: "ice"; cand: RTCIceCandidateInit };

export function ringChannel(userId: string): RealtimeChannel {
  return createSupabaseBrowserClient().channel(`fb-ring:${userId}`);
}

export function callChannel(matchId: string): RealtimeChannel {
  return createSupabaseBrowserClient().channel(`fb-call:${matchId}`);
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
