/**
 * GET /api/calls/ice — ICE configuration for Freeborn calls.
 *
 * THE critical piece for mobile: STUN alone cannot connect two phones on
 * carrier networks (symmetric CGNAT blocks hole-punching). A TURN relay is
 * mandatory for reliable calls, exactly like every production call app.
 *
 * Override via env when you have your own relay (Cloudflare Calls / Twilio /
 * your own coturn): FREEBORN_TURN_URL (turn: or turns:), FREEBORN_TURN_USER,
 * FREEBORN_TURN_CRED. Until then the community relay below keeps calls alive.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const turnUrl = process.env.FREEBORN_TURN_URL ?? "";
  const turnUser = process.env.FREEBORN_TURN_USER ?? "";
  const turnCred = process.env.FREEBORN_TURN_CRED ?? "";

  const iceServers: Array<Record<string, unknown>> = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
    { urls: "stun:stun.nextcloud.com:443" },
  ];

  if (turnUrl) {
    iceServers.push(
      turnUser
        ? { urls: turnUrl, username: turnUser, credential: turnCred }
        : { urls: turnUrl }
    );
  } else {
    // Metered open relay — free community TURN for exactly this purpose.
    iceServers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:3478",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return Response.json({
    iceServers,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
}
