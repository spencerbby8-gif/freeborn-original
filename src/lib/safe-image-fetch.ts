const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const CHAT_MEDIA_PATH = /^\/api\/chat\/media\/[0-9a-f-]{36}$/i;

export type ProfilePhotoRef =
  | { kind: "storage"; path: string }
  | { kind: "chat-media"; path: string };

/** Reject arbitrary URLs and path traversal before any server-side fetch. */
export function profilePhotoRef(storagePath: string): ProfilePhotoRef | null {
  if (!storagePath || storagePath.length > 512) return null;
  if (URL_SCHEME.test(storagePath) || storagePath.startsWith("//") || storagePath.includes("\\")) return null;
  if (CHAT_MEDIA_PATH.test(storagePath)) return { kind: "chat-media", path: storagePath };
  if (storagePath.startsWith("/")) return null;
  const segments = storagePath.split("/");
  if (segments.some((s) => s.length === 0 || s === "." || s === "..")) return null;
  return { kind: "storage", path: segments.map(encodeURIComponent).join("/") };
}

export function profilePhotoUrl(ref: ProfilePhotoRef, origin: string): string | null {
  if (ref.kind === "chat-media") {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? origin;
    try {
      const url = new URL(ref.path, base);
      if (url.origin !== new URL(base).origin) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
  const supabase = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!supabase) return null;
  return `${supabase}/storage/v1/object/public/profile-photos/${ref.path}`;
}

/** Stream with a hard byte cap; never buffer an unbounded response first. */
export async function fetchImageAsDataUrl(url: string, maxBytes: number): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "error" });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch {
    return null;
  }
}
