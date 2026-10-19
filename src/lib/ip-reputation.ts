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

/**
 * Known datacenter/cloud ASNs — researched from public cloud IP registries.
 * An IP belonging to one of these is a server by definition, no matter what
 * the live flag says. Residential/ISP traffic is NEVER in this list — real
 * people are allowed by default; only proven server space gets blocked.
 */
const DATACENTER_ASNS = new Set([
  16509, 14618, // Amazon AWS
  15169, 396982, // Google / Google Cloud
  8075, 8068, // Microsoft / Azure
  14061, // DigitalOcean
  24940, 212317, // Hetzner
  20473, // Vultr / Choopa
  16276, // OVH
  63949, // Linode / Akamai
  45102, 132203, // Alibaba / Tencent Cloud
  31898, // Oracle Cloud
  14907, // Wikimedia (server space)
  32934, // Meta server space
]);

function extractAsn(asField?: string): number | null {
  if (!asField) return null;
  const m = /^AS(\d+)/.exec(asField);
  return m ? Number(m[1]) : null;
}

export async function checkIpReputation(ip: string | null | undefined): Promise<IpVerdict> {
  if (!ip) return NEUTRAL;
  // clientIp() now returns a single address, but normalise again here so this
  // function stays correct for any other caller that hands it a raw header.
  const hops = ip.split(",").map((s) => s.trim()).filter(Boolean);
  const clean = hops[hops.length - 1] ?? "";
  if (!clean || clean === "127.0.0.1" || clean === "::1" || clean.startsWith("10.")
      || clean.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(clean)) {
    return NEUTRAL; // local/dev traffic
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    // NOTE: http:// is not a typo — ip-api.com's free tier is HTTP-only, so
    // member IP addresses cross the network in cleartext and the free tier is
    // capped at 45 req/min (this check therefore fails open constantly under
    // load). Audit finding M7: replace with a local MaxMind GeoIP2 database,
    // which has no rate limit, no cleartext hop, and no third-party disclosure.
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,proxy,hosting,isp,org,as,country,countryCode,lat,lon`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return NEUTRAL; // fail open
    const j = (await res.json()) as {
      status?: string;
      proxy?: boolean;
      hosting?: boolean;
      isp?: string;
      org?: string;
      as?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lon?: number;
    };
    if (j.status !== "success") return NEUTRAL; // fail open
    const asn = extractAsn(j.as);
    return {
      ok: true,
      datacenter: j.hosting === true || (asn !== null && DATACENTER_ASNS.has(asn)),
      proxy: j.proxy === true || asn === 13335, // Cloudflare edge/WARP = privacy, not abuse
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

/**
 * Client IP from request headers (behind proxies / Netlify).
 *
 * SECURITY — this function used to return `x-forwarded-for.split(",")[0]`, the
 * LEFTMOST entry. Proxies APPEND to that header; they never overwrite it. So
 * the leftmost value is whatever the client wrote, and a caller could set
 * `X-Forwarded-For: <any residential IP>` to walk past the datacenter block,
 * or `X-Forwarded-For: <known datacenter IP>` to get an innocent member
 * written into `suspensions` and bounced off the auth screen on every retry.
 * It also poisoned `security_events`, which the appeals flow adjudicates on.
 *
 * Order below is deliberate:
 *   1. Netlify's own header, derived from the TCP connection — not client-settable.
 *   2. The RIGHTMOST X-Forwarded-For entry, which is the one appended by the
 *      closest trusted hop.
 *   3. Nothing. We return null rather than trusting `x-real-ip`, which is
 *      equally client-settable; callers already fail open on null.
 */
export function clientIp(request: Request): string | null {
  const netlify = request.headers.get("x-nf-client-connection-ip");
  if (netlify?.trim()) return netlify.trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return null;
}
