import { safeNextPath } from "@/lib/auth/url";

/** A database notice may only navigate inside the authenticated app. */
export function safeMemberNoticeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = safeNextPath(value, "");
  if (!path) return null;
  const pathname = new URL(path, "https://freeborn.invalid").pathname;
  return pathname === "/app" || pathname.startsWith("/app/") ? path : null;
}
