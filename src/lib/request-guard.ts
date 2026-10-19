/**
 * Cross-origin (CSRF) guard for mutating API routes.
 *
 * WHY THIS EXISTS
 *   The Supabase session cookie was set to SameSite=None so the sandboxed
 *   preview iframe could authenticate (see src/lib/supabase/proxy.ts). With
 *   SameSite=None the browser sends that cookie on cross-site requests, and
 *   src/lib/supabase/api-auth.ts falls back to the cookie session whenever no
 *   Bearer token is present. That combination means any third-party page could
 *   drive state-changing POST/DELETE requests as a signed-in member — send a
 *   message, unmatch someone, delete the account.
 *
 *   proxy.ts now uses SameSite=Lax in production, which closes most of it.
 *   This is the second layer: an explicit Origin check that does not depend on
 *   cookie attributes being right, and keeps working if SameSite=None is ever
 *   re-enabled for a preview deploy.
 *
 * USAGE — at the top of every mutating handler:
 *   const blocked = rejectCrossOrigin(request);
 *   if (blocked) return blocked;
 */

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const add = (v: string | undefined) => {
    if (!v) return;
    for (const part of v.split(",")) {
      const trimmed = part.trim().replace(/\/$/, "");
      if (trimmed) origins.add(trimmed);
    }
  };
  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.FREEBORN_ALLOWED_ORIGINS);
  add("https://freeborn.netlify.app");
  return origins;
}

/**
 * True when the request is same-origin, or carries no Origin at all.
 *
 * A missing Origin is allowed: same-origin GETs, native apps, and some privacy
 * browsers omit it. This guard is about blocking a *present, foreign* Origin on
 * a mutation — not about demanding one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (allowedOrigins().has(origin.replace(/\/$/, ""))) return true;
  // Fall back to comparing against the request's own host (preview URLs,
  // deploy previews, custom domains added later).
  try {
    return new URL(request.url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * Returns a 403 Response when the request is cross-origin, otherwise null.
 *
 * Note the deliberate choice of method: GET/HEAD/OPTIONS are exempt because
 * they must stay readable by browsers doing preflight and navigation. Call this
 * only from POST/PATCH/PUT/DELETE handlers.
 */
export function rejectCrossOrigin(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (isSameOrigin(request)) return null;
  return Response.json(
    { error: "Cross-origin request rejected." },
    { status: 403 },
  );
}
