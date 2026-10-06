import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const FALLBACK_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";
const FALLBACK_KEY = "sb_publishable_7N1q-Cnr7bXvBKJQGuG4zg_MCML5bPc";

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
      sameSite: "none",
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
          sameSite: "none",
          secure: true,
        });
      }
    }
  }

  return response;
}
