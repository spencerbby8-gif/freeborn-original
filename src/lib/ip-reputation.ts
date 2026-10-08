/**
 * FREEBORN IP REPUTATION ENGINE
 *
 * Identifies datacenter / hosting / proxy traffic at the door. Datacenter
 * IPs are where bot farms and mass-signup abuse live — real members come
 * from residential connections.
 *
 * Source: ip-api.com (free, no key). Fails OPEN — if the intel service is
 * down we never block a real person because of it.
 *
 * Policy (deliberate, matches Freeborn's privacy-minded community):
 *  - hosting/datacenter → BLOCK (suspend + bounce to auth screen)
 *  - VPN/proxy          → RECORD ONLY (many members are privacy-focused;
 *                         a VPN is not proof of abuse)
 */

export type IpVerdict = {
  ok: boolean;
  datacenter: boolean;
  proxy: boolean;
  isp?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

const NEUTRAL: IpVerdict = { ok: true, datacenter: false, proxy: false };

export async function checkIpReputation(ip: string | null | undefined): Promise<IpVerdict> {
  if (!ip) return NEUTRAL;
  const clean = ip.split(",")[0].trim();
  if (!clean || clean === "127.0.0.1" || clean.startsWith("10.") || clean.startsWith("192.168.")) {
    return NEUTRAL; // local/dev traffic
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,proxy,hosting,isp,org,country,countryCode,lat,lon`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return NEUTRAL; // fail open
    const j = (await res.json()) as {
      status?: string;
      proxy?: boolean;
      hosting?: boolean;
      isp?: string;
      org?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lon?: number;
    };
    if (j.status !== "success") return NEUTRAL; // fail open
    return {
      ok: true,
      datacenter: j.hosting === true,
      proxy: j.proxy === true,
      isp: j.isp ?? j.org,
      country: j.country,
      countryCode: j.countryCode,
      latitude: j.lat,
      longitude: j.lon,
    };
  } catch {
    return NEUTRAL; // fail open — intel outage never blocks a member
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort client IP from request headers (behind proxies/Netlify). */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
