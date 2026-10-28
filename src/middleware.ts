import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildContentSecurityPolicy, generateNonce, staticSecurityHeaders } from "@/lib/security-headers";

/**
 * CSP enforcement mode.
 *
 * `report-only` sends Content-Security-Policy-Report-Only, which logs violations in
 * the browser console without blocking anything. Use it when adding an origin or
 * directive, confirm the console is clean across the flows that load external
 * resources (verification pulls MediaPipe WASM from jsdelivr and a model from
 * storage.googleapis.com; onboarding calls BigDataCloud; sign-in loads Turnstile),
 * then flip back to `enforce`.
 *
 * It is a module-level constant rather than an env var on purpose: a security header
 * should not be silently downgradable by a config change nobody reviewed.
 */
const CSP_MODE: "enforce" | "report-only" = "enforce";

/**
 * Whether inline scripts must be allowed.
 *
 * FALSE as of the 2026-10-27 audit (F9). The nonce plumbing below and in
 * `updateSession` was already correct on dynamic routes; the blocker was that
 * marketing/legal routes were prerendered, so a per-request nonce could not
 * reach them. `src/app/layout.tsx` now exports `dynamic = "force-dynamic"`, so
 * every route renders per request and Next.js stamps the nonce onto its inline
 * scripts. The two hand-written JSON-LD scripts carry the nonce explicitly and
 * the service-worker registration is an external /sw-register.js.
 *
 * Trade-off: prerendering is given up in exchange for actually enforcing
 * script-src. connect-src, frame-ancestors, form-action, base-uri and
 * object-src stay locked. Cost is one server render per page view; no feature
 * changes. Verified by build + live CSP header checks after deploy.
 */
const CSP_INLINE_SCRIPTS = false;

export async function middleware(request: NextRequest) {
  /* Magic-link rescue: if Supabase's redirect allowlist drops our callback
     path, the member lands somewhere else (often "/") still carrying the
     one-time code. Catch it and route it to the exchange page so the sign-in
     completes instead of dumping them on the landing page. */
  const { pathname, searchParams } = request.nextUrl;
  const hasAuthCode = searchParams.has("code") || searchParams.has("token_hash");
  if (hasAuthCode && !pathname.startsWith("/auth/callback") && !pathname.startsWith("/api/")) {
    const target = new URL("/auth/callback", request.url);
    searchParams.forEach((value, key) => target.searchParams.set(key, value));
    if (!target.searchParams.has("next")) target.searchParams.set("next", "/onboarding");
    return NextResponse.redirect(target);
  }

  /* Security headers are applied here rather than in next.config.ts because the
     CSP needs a per-request nonce and `headers()` in the config file is static.

     The CSP and the nonce go on the REQUEST headers as well as the response.
     Next.js reads them from the request during rendering and stamps the nonce onto
     the inline scripts it emits. Setting them on the response alone leaves those
     scripts unstamped, and an enforced script-src then blocks the flight payload
     that boots the app. */
  const nonce = CSP_INLINE_SCRIPTS ? null : generateNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const headerName =
    CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    /* Next.js reads the nonce from the REQUEST headers while rendering and stamps it
       onto the inline scripts it emits. Setting it only on the response arrives after
       rendering, which is why the first attempt produced 0 nonced scripts on the
       dynamic route as well. */
    requestHeaders.set("x-nonce", nonce);
  }
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);

  for (const [name, value] of Object.entries(staticSecurityHeaders())) {
    response.headers.set(name, value);
  }
  response.headers.set(headerName, csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets so the Supabase session is
     * refreshed on every real request.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|uploads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff2?)$).*)",
  ],
};
