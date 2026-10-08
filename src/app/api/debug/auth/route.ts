import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth diagnostic. Answers, with facts: did the browser send the Supabase
 * session cookie? Was this request made inside a cross-site iframe? Does the
 * server see a live session?
 */
export async function GET() {
  // Security: diagnostics must never ship live. A comparable niche platform
  // (Unjected) leaked its entire user base through exposed debug tooling.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const cookieStore = await cookies();
  const headerStore = await headers();
  const allCookies = cookieStore.getAll();

  const sbCookies = allCookies
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => ({ name: c.name, length: c.value.length }));

  const secFetch = {
    dest: headerStore.get("sec-fetch-dest"),
    site: headerStore.get("sec-fetch-site"),
    mode: headerStore.get("sec-fetch-mode"),
  };
  const inCrossSiteIframe =
    secFetch.dest === "iframe" || secFetch.site === "cross-site";

  let session: { hasUser: boolean; email?: string; error?: string } = {
    hasUser: false,
  };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      session = { hasUser: false, error: error.message };
    } else if (data?.user) {
      session = { hasUser: true, email: data.user.email ?? undefined };
    }
  } catch (err) {
    session = {
      hasUser: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }

  return Response.json({
    envConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    ),
    cookieNames: allCookies.map((c) => c.name),
    sbCookies,
    secFetch,
    inCrossSiteIframe,
    session,
    hint: inCrossSiteIframe && sbCookies.length === 0
      ? "Request came from a cross-site iframe WITHOUT session cookies — SameSite=Lax cookies cannot be sent here. Cookies must be SameSite=None;Secure (now fixed) or the page opened in its own tab."
      : sbCookies.length === 0
        ? "No Supabase session cookie arrived — sign in has not happened or the cookie was not stored."
        : session.hasUser
          ? "Healthy: session cookie present and Supabase recognizes the user."
          : "Session cookie arrived but Supabase rejected it — check the error field.",
  });
}
