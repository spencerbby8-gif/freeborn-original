import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const FALLBACK_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";
const FALLBACK_KEY = "sb_publishable_7N1q-Cnr7bXvBKJQGuG4zg_MCML5bPc";

/**
 * SameSite for the Supabase session cookies.
 *
 * This was hardcoded to "none" so the sandboxed preview iframe could
 * authenticate. SameSite=None tells the browser to send the session cookie on
 * CROSS-SITE requests — and src/lib/supabase/api-auth.ts falls back to the
 * cookie session whenever no Bearer token is present, so every mutating
 * POST/DELETE route became reachable from any third-party page as a signed-in
 * member (send a message, unmatch someone, delete the account). There was no
 * CSRF token and no Origin check anywhere to compensate.
 *
 * So: Lax in production, None in development where the preview needs it, with
 * an explicit escape hatch if a cross-site embed is ever genuinely required.
 * src/lib/request-guard.ts is the second layer and does not depend on this
 * value being correct.
 */
/* Audit finding (preview cookie security, 2026-10-28).
 *
 * The old rule was "lax in production, none everywhere else". Production is the
 * *only* place a session cookie matters, and NODE_ENV is "development" on every
 * Vercel preview deployment — so every preview URL ran with SameSite=None, i.e.
 * the CSRF exposure the comment above describes was live on previews, gated only
 * by an Origin check that 16 mutating routes did not make.
 *
 * New rule: lax is the default in every environment; `none` is opt-in, per
 * deployment, via FREEBORN_ALLOW_CROSS_SITE_COOKIES=1. That variable is absent
 * from the Vercel project (verified 2026-10-28), so production behaviour is
 * UNCHANGED, and a reviewer who genuinely needs a cross-site embed in a preview
 * sets the flag on that deployment instead of inheriting it by default.
 *
 * Cost, stated plainly: a preview opened inside a third-party cross-site iframe
 * can no longer authenticate until the flag is set. The preview URL opened in its
 * own tab is same-origin and keeps working. The escape hatch above is the
 * documented way to restore the old behaviour deliberately.
 */
const CROSS_SITE_EMBEDS_ENABLED = process.env.FREEBORN_ALLOW_CROSS_SITE_COOKIES === "1";
const COOKIE_SAME_SITE: "lax" | "none" = CROSS_SITE_EMBEDS_ENABLED ? "none" : "lax";

export async function updateSession(
  request: NextRequest,
  requestHeaders?: Headers,
) {
  /* Both NextResponse.next() calls below must carry the same request headers, or
     the CSP nonce is dropped on whichever path runs second and Next.js renders
     inline scripts without it. A single helper makes that impossible to get wrong.

     WHY THE NONCE GOES ON THE REQUEST
     ---------------------------------
     Next.js extracts the CSP nonce from the REQUEST headers when it renders the
     page and applies it to the inline scripts it emits (the React Server Component
     flight payload, which is what boots the app). A header set only on the response
     arrives after rendering, so the scripts come out without a nonce and an enforced
     script-src blocks them: a blank page. Verified 2026-10-19 — with the nonce on
     the response only, 0 of 20 script tags carried it. */
  const next = () =>
    NextResponse.next(
      requestHeaders ? { request: { headers: requestHeaders } } : { request },
    );

  let response = next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    FALLBACK_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: COOKIE_SAME_SITE,
      secure: true,
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refreshes the session token if needed and writes updated cookies.
  // Never let a bad/stale cookie take the whole site down.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Corrupt cookie — expire it so the member starts clean.
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        response.cookies.set(cookie.name, "", {
          maxAge: 0,
          path: "/",
          sameSite: COOKIE_SAME_SITE,
          secure: true,
        });
      }
    }
  }

  return response;
}

