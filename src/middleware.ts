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
 * TRUE, and it cannot be false without taking the site down. Measured 2026-10-19
 * against a production build, counting script tags that carried the request nonce:
 *
 *     /        static    20 scripts,  0 nonced, flight payload NOT nonced
 *     /privacy static    17 scripts,  0 nonced, flight payload NOT nonced
 *     /auth    dynamic   15 scripts, 15 nonced, flight payload nonced
 *
 * Statically prerendered routes have their HTML frozen at BUILD time, so a
 * per-request nonce cannot reach them. `/auth` proves the nonce plumbing in this
 * file and in `updateSession` is correct; the limitation is prerendering, not the
 * wiring. Enforcing a nonce-only script-src would therefore blank the landing page,
 * all three legal documents, /safety and the whole /app shell, because none of them
 * could execute the React Server Component payload that boots the app.
 *
 * What this costs and what still protects us:
 *   Lost: CSP cannot block an injected INLINE script.
 *   Kept: connect-src is allowlisted, so a stolen session token has nowhere to be
 *         sent. frame-ancestors, form-action, base-uri and object-src are all locked.
 *         And the app loads ZERO third-party scripts (verified by grep across src/),
 *         which removes the vector that delivers most real-world XSS in the first
 *         place.
 *
 * To get nonce enforcement later, the marketing and legal routes would have to render
 * dynamically (export const dynamic = "force-dynamic"), trading away prerendering.
 * That is a deliberate trade to make on purpose, not one to stumble into here.
 */
const CSP_INLINE_SCRIPTS = true;

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
