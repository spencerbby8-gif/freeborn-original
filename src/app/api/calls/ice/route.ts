import { getMember } from "@/lib/app-auth";
import { findParticipantSession, isCallSessionLive } from "@/lib/call-session-server";
import { buildTurnServer, fetchCloudflareIceServers } from "@/lib/turn-credentials";
import { badIdResponse, isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/** STUN is a direct-path aid, not a relay and not a guarantee of connectivity. */
const STUN_ONLY: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  { urls: "stun:stun.nextcloud.com:443" },
];

/** GET /api/calls/ice?callId=… — authenticated, session-scoped ICE issuance.
 *  Relay precedence: Cloudflare hosted TURN (API-minted short-lived credentials)
 *  when its key id + token are provisioned, else a coturn `use-auth-secret` relay
 *  when FREEBORN_TURN_* are provisioned, else STUN-only. In every case the long-
 *  lived secret/token stays server-side; only short-lived grants reach the browser
 *  and static TURN usernames/passwords are never served. `relayStatus` reports
 *  honestly which path produced the grant so a call is never claimed to be relayed
 *  when it is not. */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const callId = new URL(request.url).searchParams.get("callId");
  if (!isUuid(callId)) return badIdResponse();
  const session = await findParticipantSession(callId, member.id);
  if (!session) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!isCallSessionLive(session)) return Response.json({ error: "This call has expired." }, { status: 410 });

  const iceServers: RTCIceServer[] = [...STUN_ONLY];
  const pushUnique = (server: RTCIceServer) => {
    const key = JSON.stringify(server.urls);
    if (!iceServers.some((s) => JSON.stringify(s.urls) === key)) iceServers.push(server);
  };

  // 1) Cloudflare hosted TURN — preferred when provisioned. Mints short-lived,
  //    ready-to-use credentials; never throws (falls through to coturn on any fault).
  const cloudflare = await fetchCloudflareIceServers({
    FREEBORN_CLOUDFLARE_TURN_KEY_ID: process.env.FREEBORN_CLOUDFLARE_TURN_KEY_ID,
    FREEBORN_CLOUDFLARE_TURN_API_TOKEN: process.env.FREEBORN_CLOUDFLARE_TURN_API_TOKEN,
    FREEBORN_CLOUDFLARE_TURN_TTL_SECONDS: process.env.FREEBORN_CLOUDFLARE_TURN_TTL_SECONDS,
  });
  if (cloudflare) {
    for (const s of cloudflare.iceServers) pushUnique(s as RTCIceServer);
    return Response.json(
      {
        iceServers,
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        relayConfigured: true,
        relayStatus: "cloudflare-live",
        relayProvider: "cloudflare",
        credentialExpiresAt: Math.floor(Date.now() / 1000) + cloudflare.ttl,
        credentialTtlSeconds: cloudflare.ttl,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // 2) coturn `use-auth-secret` relay — local HMAC of a long-lived shared secret.
  const turn = buildTurnServer(member.id, {
    FREEBORN_TURN_URL: process.env.FREEBORN_TURN_URL,
    FREEBORN_TURN_SHARED_SECRET: process.env.FREEBORN_TURN_SHARED_SECRET,
    FREEBORN_TURN_TTL_SECONDS: process.env.FREEBORN_TURN_TTL_SECONDS,
  });
  if (turn) pushUnique(turn.server as RTCIceServer);

  // 3) STUN-only (no relay). iceServers already holds STUN_ONLY.
  return Response.json(
    {
      iceServers,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      relayConfigured: Boolean(turn),
      relayStatus: turn ? "configured-unverified" : "unconfigured",
      ...(turn ? { relayProvider: "coturn", credentialExpiresAt: turn.expiresAt, credentialTtlSeconds: turn.ttl } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
