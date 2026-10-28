/**
 * GET /api/calls/ice — ICE configuration for Freeborn calls.
 *
 * THE critical piece for mobile: STUN alone cannot connect two phones on
 * carrier networks (symmetric CGNAT blocks hole-punching). A TURN relay is
 * mandatory for reliable calls, exactly like every production call app.
 *
 * Configure your own relay with FREEBORN_TURN_URL (turn: or turns:),
 * FREEBORN_TURN_USER and FREEBORN_TURN_CRED in Vercel.
 *
 * WHAT CHANGED (audit finding F-F, 2026-10-28)
 * --------------------------------------------
 * When none of those three were set the route fell back to a hardcoded public
 * relay (openrelay.metered.ca, username/credential `openrelayproject`) and handed
 * it to whoever asked — and nothing asked first: the route was anonymous. That is
 * two separate problems. (1) Anyone could enumerate and use a shared third-party
 * relay whose credentials are published in a public repository, so relay quota and
 * traffic attribution were not yours. (2) The app silently depended on a
 * community service with no uptime obligation, which is precisely the failure mode
 * this file's own comment warned about for mobile users — it would fail as
 * "calls don't connect", not as "TURN is not configured".
 *
 * Now: no fallback relay is served. Unconfigured means STUN-only plus
 * `relayConfigured: false`, and the client can say so honestly instead of
 * pretending a call is expected to work on carrier NAT. `getIceConfig()` in
 * src/lib/call-bus.ts already accepts any non-empty iceServers array, so the
 * response shape is unchanged for working configurations.
 */

export const dynamic = "force-dynamic";

/** STUN keeps LAN / same-ISP and most desktop calls working, and is free. */
const STUN_ONLY: Array<Record<string, unknown>> = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  { urls: "stun:stun.nextcloud.com:443" },
];

export async function GET(request: Request) {
  const turnUrl = (process.env.FREEBORN_TURN_URL ?? "").trim();
  const turnUser = (process.env.FREEBORN_TURN_USER ?? "").trim();
  const turnCred = (process.env.FREEBORN_TURN_CRED ?? "").trim();

  const iceServers: Array<Record<string, unknown>> = [...STUN_ONLY];
  let relayConfigured = false;

  if (turnUrl) {
    if (!turnUser || !turnCred) {
      /* Half-configured is worse than unconfigured: the client would believe a
         relay exists and blame the network when authentication fails. Report it,
         but do not advertise a relay that cannot be used. */
      console.error(
        "[calls/ice] FREEBORN_TURN_URL is set but FREEBORN_TURN_USER/FREEBORN_TURN_CRED are not; serving STUN only",
      );
    } else {
      iceServers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
      relayConfigured = true;
    }
  }

  return Response.json(
    {
      iceServers,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      relayConfigured,
    },
    {
      headers: {
        /* Credentials for a customer's relay must never be cacheable by a shared
           cache or readable from another tenant's browser history. */
        "Cache-Control": "private, no-store",
      },
    },
  );
}
