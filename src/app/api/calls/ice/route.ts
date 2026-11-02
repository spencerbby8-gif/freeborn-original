import { getMember } from "@/lib/app-auth";
import { findParticipantSession, isCallSessionLive } from "@/lib/call-session-server";
import { buildTurnServer } from "@/lib/turn-credentials";
import { badIdResponse, isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/** STUN is a direct-path aid, not a relay and not a guarantee of connectivity. */
const STUN_ONLY: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  { urls: "stun:stun.nextcloud.com:443" },
];

/** GET /api/calls/ice?callId=… — authenticated, session-scoped ICE issuance.
 *  TURN stays explicitly unconfigured until a compatible relay and shared secret
 *  are provisioned. Static TURN usernames/passwords are deliberately not served. */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const callId = new URL(request.url).searchParams.get("callId");
  if (!isUuid(callId)) return badIdResponse();
  const session = await findParticipantSession(callId, member.id);
  if (!session) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!isCallSessionLive(session)) return Response.json({ error: "This call has expired." }, { status: 410 });

  const turn = buildTurnServer(member.id, {
    FREEBORN_TURN_URL: process.env.FREEBORN_TURN_URL,
    FREEBORN_TURN_SHARED_SECRET: process.env.FREEBORN_TURN_SHARED_SECRET,
    FREEBORN_TURN_TTL_SECONDS: process.env.FREEBORN_TURN_TTL_SECONDS,
  });
  const iceServers: RTCIceServer[] = [...STUN_ONLY];
  if (turn) iceServers.push(turn.server);

  return Response.json(
    {
      iceServers,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      relayConfigured: Boolean(turn),
      relayStatus: turn ? "configured-unverified" : "unconfigured",
      ...(turn ? { credentialExpiresAt: turn.expiresAt, credentialTtlSeconds: turn.ttl } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
