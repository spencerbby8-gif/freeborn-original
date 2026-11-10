import { createHmac } from "node:crypto";

/** Standard TURN REST API temporary credentials (coturn `use-auth-secret`).
 *  The shared secret never leaves the server; the browser receives only an
 *  expiry-bound username and its HMAC. This is an expired individual IETF draft
 *  implemented by compatible TURN servers, not a claim of vendor interoperability. */
export const TURN_TTL_SECONDS = 300;

export type TurnEnv = {
  FREEBORN_TURN_URL?: string;
  FREEBORN_TURN_SHARED_SECRET?: string;
  FREEBORN_TURN_TTL_SECONDS?: string;
};

export function validTurnUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  const urls = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0 || urls.length > 8) return [];
  for (const value of urls) {
    // RFC 7064/7065 TURN URIs are `turn:host[:port][?transport=udp|tcp]`.
    // They are not special-scheme WHATWG URLs, so `new URL("turn:host")` has no
    // hostname. Validate the authority directly and reject embedded credentials.
    const m = /^turns?:([^/?#\s]+)(?:\?transport=(udp|tcp))?$/i.exec(value);
    if (!m) return [];
    const authority = m[1];
    if (authority.includes("@") || authority.includes("/") || authority.length > 253) return [];
    const portMatch = /:(\d+)$/.exec(authority);
    if (portMatch) {
      const port = Number(portMatch[1]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
    }
  }
  return urls;
}

export function turnTtlSeconds(raw: string | undefined): number {
  const n = Number(raw ?? TURN_TTL_SECONDS);
  if (!Number.isInteger(n)) return TURN_TTL_SECONDS;
  return Math.min(900, Math.max(60, n));
}

export function buildTurnServer(memberId: string, env: TurnEnv, nowMs = Date.now()) {
  const urls = validTurnUrls(env.FREEBORN_TURN_URL);
  const secret = env.FREEBORN_TURN_SHARED_SECRET?.trim() ?? "";
  if (urls.length === 0 || secret.length < 32) return null;
  const ttl = turnTtlSeconds(env.FREEBORN_TURN_TTL_SECONDS);
  const expiresAt = Math.floor(nowMs / 1000) + ttl;
  const username = `${expiresAt}:${memberId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { server: { urls, username, credential }, expiresAt, ttl };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Cloudflare Realtime TURN — hosted relay with API-minted short-lived credentials.
 *
 * WHY THIS IS A SEPARATE PATH FROM THE coturn SCHEME ABOVE
 * --------------------------------------------------------
 * coturn's `use-auth-secret` model uses ONE long-lived shared secret that the
 * server holds forever and HMACs locally into per-member usernames. Cloudflare's
 * TURN has no such secret. Instead the server holds a long-lived TURN Key ID +
 * API Token and calls Cloudflare's `generate-ice-servers` endpoint, which mints
 * ready-to-use, short-lived RTCIceServers (username + credential already bound to
 * a TTL). The API token can mint unlimited credentials, so — exactly like the
 * coturn secret — it never leaves the server; only the short-lived grant reaches
 * the browser. This is the hosted alternative to running a relay box, and when it
 * is configured it is preferred (no infrastructure to operate, TLS on 443 gets
 * through restrictive NATs/firewalls that block plain UDP).
 *
 * Endpoint contract (Cloudflare Realtime/Calls TURN, verified against the public
 * API and multiple independent client implementations):
 *   POST https://rtc.live.cloudflare.com/v1/turn/keys/{KEY_ID}/credentials/generate-ice-servers
 *   Authorization: Bearer {API_TOKEN}
 *   Content-Type: application/json
 *   body: {"ttl": <60..86400 seconds>}
 *   → {"iceServers":[{urls:[stun…]}, {urls:[turn:…udp, turn:…tcp, turns:…5349,
 *      turn:…53, turn:…80, turns:…443], username, credential}]}
 * ───────────────────────────────────────────────────────────────────────────── */

export const CLOUDFLARE_TURN_API_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys";
/** Cloudflare's own default TTL; we clamp caller input to its documented 60–86400. */
export const CLOUDFLARE_TURN_TTL_SECONDS = 86_400;

export type CloudflareTurnEnv = {
  FREEBORN_CLOUDFLARE_TURN_KEY_ID?: string;
  FREEBORN_CLOUDFLARE_TURN_API_TOKEN?: string;
  FREEBORN_CLOUDFLARE_TURN_TTL_SECONDS?: string;
};

/** Structurally compatible with the DOM `RTCIceServer` the route serves. */
export type TurnIceServer = { urls: string[]; username?: string; credential?: string };

/** Cloudflare TURN is only usable when BOTH the key id and the API token are set. */
export function cloudflareTurnConfigured(env: CloudflareTurnEnv): boolean {
  return Boolean(env.FREEBORN_CLOUDFLARE_TURN_KEY_ID?.trim() && env.FREEBORN_CLOUDFLARE_TURN_API_TOKEN?.trim());
}

export function cloudflareTurnTtl(raw: string | undefined): number {
  const n = Number(raw ?? CLOUDFLARE_TURN_TTL_SECONDS);
  if (!Number.isInteger(n)) return CLOUDFLARE_TURN_TTL_SECONDS;
  return Math.min(86_400, Math.max(60, n));
}

/**
 * Chrome and Firefox refuse STUN/TURN on port 53 and stall ICE gathering on it, so
 * the port-53 URLs Cloudflare returns must be dropped before the list reaches a peer
 * connection. Matches `:53` only as a port (before `?transport` or end-of-string) on
 * a stun/stuns/turn/turns URL — never a `53` inside a larger port or a host label.
 */
function dropBlockedTurnUrls(urls: string[]): string[] {
  return urls.filter((u) => !/^(?:stun|stuns|turn|turns):[^/?#]*:53(?:\?|$)/i.test(u));
}

/**
 * Validate + normalise Cloudflare's generate-ice-servers payload. PURE — no I/O,
 * so it is unit-testable against recorded response shapes. Accepts the current
 * `{ iceServers: [...] }` array form and the older single-object form. A turn/turns
 * entry is only usable if it carries both a username and a credential; entries that
 * reduce to nothing after port-53 filtering are dropped. Returns null unless at
 * least one usable credentialed relay survives — so a malformed or empty response
 * never silently downgrades a call to "relay configured" with no relay.
 */
export function parseCloudflareIceServers(payload: unknown): { iceServers: TurnIceServer[] } | null {
  if (!payload || typeof payload !== "object") return null;
  let raw = (payload as Record<string, unknown>).iceServers;
  if (raw && !Array.isArray(raw) && typeof raw === "object") raw = [raw]; // legacy single-object form
  if (!Array.isArray(raw)) return null;

  const out: TurnIceServer[] = [];
  let sawCredentialedTurn = false;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    let urls = e.urls;
    if (typeof urls === "string") urls = [urls];
    if (!Array.isArray(urls)) continue;
    const clean = dropBlockedTurnUrls(urls.filter((u): u is string => typeof u === "string"));
    if (clean.length === 0) continue;
    const username = typeof e.username === "string" ? e.username : undefined;
    const credential = typeof e.credential === "string" ? e.credential : undefined;
    const isTurn = clean.some((u) => /^turns?:/i.test(u));
    if (isTurn) {
      if (!username || !credential) continue; // a relay with no credentials is useless
      sawCredentialedTurn = true;
      out.push({ urls: clean, username, credential });
    } else {
      out.push({ urls: clean }); // STUN-only helper entry
    }
  }
  if (!sawCredentialedTurn) return null;
  return { iceServers: out };
}

/**
 * Mint short-lived ICE servers from Cloudflare. NEVER throws: any failure
 * (unconfigured, network, non-2xx, timeout, malformed body) returns null so the
 * caller falls back to the coturn path and then to STUN-only. `baseUrl`,
 * `timeoutMs` and `fetchImpl` are injectable so the trust harness can exercise
 * this against a local double without touching the network.
 */
export async function fetchCloudflareIceServers(
  env: CloudflareTurnEnv,
  opts: { baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ iceServers: TurnIceServer[]; ttl: number } | null> {
  if (!cloudflareTurnConfigured(env)) return null;
  const keyId = env.FREEBORN_CLOUDFLARE_TURN_KEY_ID!.trim();
  const token = env.FREEBORN_CLOUDFLARE_TURN_API_TOKEN!.trim();
  const ttl = cloudflareTurnTtl(env.FREEBORN_CLOUDFLARE_TURN_TTL_SECONDS);
  const base = opts.baseUrl ?? CLOUDFLARE_TURN_API_BASE;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5_000);
  try {
    const res = await doFetch(`${base}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        /* rtc.live.cloudflare.com is Cloudflare-fronted; Node's default fetch UA is
           rejected with error 1010, which surfaces as an opaque failure. Mirrors the
           workaround in src/lib/engine-request.ts. */
        "User-Agent": "freeborn-turn/1.0",
      },
      body: JSON.stringify({ ttl }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as unknown;
    const parsed = parseCloudflareIceServers(data);
    if (!parsed) return null;
    return { iceServers: parsed.iceServers, ttl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
