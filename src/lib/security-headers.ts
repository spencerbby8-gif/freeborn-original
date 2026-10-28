/**
 * Security headers for every response.
 *
 * The live deployment previously sent only Strict-Transport-Security. No CSP, no
 * frame protection, no nosniff, no referrer policy, no permissions policy. The root
 * cause was `next.config.ts` being an empty object and no `vercel.json` existing, so
 * nothing ever set them.
 *
 * They are applied in middleware rather than `next.config.ts` because the Content
 * Security Policy needs a per-request nonce, and `headers()` in the config file is
 * static and cannot produce one.
 *
 * WHY A NONCE RATHER THAN 'unsafe-inline'
 * ---------------------------------------
 * Session cookies are now HttpOnly (F9, 2026-10-27): the browser client uses
 * localStorage for its session and attaches Bearer tokens, so no page script
 * needs to read the cookie. An allowlisted connect-src still limits where a
 * stolen token could be sent. `'unsafe-inline'` in script-src was removed in
 * favour of a per-request nonce (see src/middleware.ts).
 *
 * A nonce means only scripts carrying this request's secret value may execute.
 * Next.js reads the CSP header set by middleware and propagates the same nonce to
 * every inline script it renders, so hydration keeps working. Our own inline script
 * (the service worker registration) was moved to a static file at /sw-register.js so
 * that nothing hand-written needs a nonce.
 *
 * `'unsafe-inline'` IS retained for style-src only. The codebase sets inline style
 * attributes throughout (tilt and lift CSS custom properties on cards, ken burns
 * timing, dynamic gradients), and Next.js injects inline styles. Style injection is
 * a far weaker primitive than script injection, so this is an accepted tradeoff.
 *
 * EVERY EXTERNAL ORIGIN BELOW WAS FOUND BY GREPPING CLIENT-REACHABLE CODE, NOT GUESSED
 * -----------------------------------------------------------------------------
 *  cdn.jsdelivr.net        MediaPipe WASM fileset      (src/lib/face-gate.ts:68)
 *  storage.googleapis.com  MediaPipe face landmarker   (src/lib/face-gate.ts:73)
 *  challenges.cloudflare.com  Turnstile script + frame (src/components/auth/turnstile.tsx)
 *  api.bigdatacloud.net    reverse geocoding, called from the browser
 *                                                      (src/components/onboarding/steps-a.tsx:207)
 *  *.supabase.co           auth, storage, realtime
 *
 * images.pexels.com was in this list and has been removed: the landing page no
 * longer loads any third-party photography. See
 * src/components/landing/member-portrait.tsx for why.
 *
 * ADDING AN ORIGIN
 * ----------------
 * If a feature starts failing silently in the browser console with a CSP violation,
 * add the origin here with a comment naming the file that needs it. Do not widen a
 * directive to `https:` or re-add `'unsafe-inline'` to script-src to make an error
 * go away; that defeats the control.
 */

/** Cryptographically random nonce, base64, unique per request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Strictly necessary permissions. Camera, microphone and geolocation are the three
 * the product genuinely uses: camera and microphone for verification and calls,
 * geolocation for discovery distance. Each is restricted to same-origin, which is
 * what stops an embedded or framed context from reaching them.
 *
 * Everything else is turned off outright rather than left at the browser default,
 * because a dating app has no use for payment handlers, USB, MIDI or ambient light
 * sensors, and a feature that is never needed should never be reachable.
 */
const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=(self)",
  "geolocation=(self)",
  "display-capture=(self)",
  "fullscreen=(self)",
  "autoplay=(self)",
  "picture-in-picture=(self)",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "midi=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "ambient-light-sensor=()",
  "interest-cohort=()",
].join(", ");

/**
 * Build the Content Security Policy.
 *
 * `nonce` is null when inline scripts must be permitted. See CSP_INLINE_SCRIPTS in
 * src/middleware.ts for the evidence behind that.
 *
 * THE TRAP THIS AVOIDS: under CSP level 2 and later, if a script-src contains BOTH
 * a nonce and `'unsafe-inline'`, browsers discard `'unsafe-inline'` and honour only
 * the nonce. Emitting both therefore does not degrade gracefully, it silently blocks
 * every unnonced script. So the two are mutually exclusive here and only one is ever
 * emitted.
 */
export function buildContentSecurityPolicy(nonce: string | null): string {
  /* MediaPipe compiles and instantiates WebAssembly for on-device face detection
     (src/lib/face-gate.ts). Without wasm-unsafe-eval the face gate never loads. */
  const scriptSrc = [
    "'self'",
    ...(nonce ? [`'nonce-${nonce}'`] : ["'unsafe-inline'"]),
    "'wasm-unsafe-eval'",
    /* Cloudflare Turnstile, src/components/auth/turnstile.tsx */
    "https://challenges.cloudflare.com",
  ];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      /* Profile photos and chat media are served from Supabase storage. */
      "https://*.supabase.co",
    ],
    "media-src": ["'self'", "blob:", "https://*.supabase.co"],

    /* This is the directive that matters most on this particular app.
       Session cookies are HttpOnly (F9) and Bearer tokens live in localStorage,
       but an allowlisted connect-src still means that even if an attacker
       achieves script execution, there is no origin they can POST the token to.
       Stealing a session you cannot exfiltrate is worth far less. */
    "connect-src": [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      /* MediaPipe WASM fileset, src/lib/face-gate.ts */
      "https://cdn.jsdelivr.net",
      /* MediaPipe face landmarker model, src/lib/face-gate.ts */
      "https://storage.googleapis.com",
      /* HIBP Pwned Passwords k-anonymity range lookup during sign-up (F9). */
      "https://api.pwnedpasswords.com",
      /* Reverse geocoding during onboarding, src/components/onboarding/steps-a.tsx.
         Listed so the call keeps working, and disclosed in Privacy Policy clause 8
         because it sends precise coordinates to a third party. Moving that call
         server-side would let this origin come back out. */
      "https://api.bigdatacloud.net",
    ],

    "frame-src": ["'self'", "https://challenges.cloudflare.com"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    /* No plugin content, ever. */
    "object-src": ["'none'"],
    /* Stops an injected <base> tag from redirecting every relative URL. */
    "base-uri": ["'self'"],
    /* Stops an injected form from posting credentials to an attacker origin. */
    "form-action": ["'self'"],
    /* Nothing may frame Freeborn. Blocks clickjacking of the sign-in,
       change-password and delete-account flows. */
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  return [
    ...Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`),
    /* Any http: subresource is upgraded to https: before the request is made. */
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Headers that need no per-request state. HSTS is included here rather than left to
 * the platform default so the policy is explicit and versioned with the code.
 */
export function staticSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    /* Stops this document from sharing a browsing context group with a
        cross-origin document, which limits Spectre-style side channels. */
    "Cross-Origin-Opener-Policy": "same-origin",
    /* Member photos and chat media must never be embeddable by another origin. */
    "Cross-Origin-Resource-Policy": "same-site",
  };
}
