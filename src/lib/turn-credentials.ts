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
