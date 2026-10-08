import { NextResponse } from "next/server";

/**
 * Cookie round-trip probe: sets cookies with different SameSite modes,
 * so we can verify whether the preview proxy + browser persist them
 * and send them back on the next request.
 */
export async function GET() {
  // Security: diagnostics must never ship live (see /api/debug/auth note).
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("probe-none", "none-value", {
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: 600,
  });
  res.cookies.set("probe-lax", "lax-value", {
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 600,
  });
  return res;
}
