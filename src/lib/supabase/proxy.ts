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
const COOKIE_SAME_SITE: "lax" | "none" =
  process.env.NODE_ENV === "production" &&
  process.env.FREEBORN_ALLOW_CROSS_SITE_COOKIES !== "1"
    ? "lax"
    : "none";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
        response = NextResponse.next({ request });
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
