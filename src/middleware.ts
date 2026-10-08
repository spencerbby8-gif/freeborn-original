import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

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

  return await updateSession(request);
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
