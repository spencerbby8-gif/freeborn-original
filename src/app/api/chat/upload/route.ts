import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/**
 * Upload a chat attachment (image / video / voice note) to Supabase Storage.
 * Accepts { data: base64DataUrl, kind: "image"|"video"|"voice" } and returns
 * the public URL. Files are stored under chat-media/<userId>/... so each
 * member only writes into their own folder (enforced by storage RLS).
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data, kind } = (body ?? {}) as { data?: string; kind?: string };
  if (!data || !data.startsWith("data:")) {
    return Response.json({ error: "A file is required." }, { status: 400 });
  }

  const mimeMatch = /^data:([^;]+);base64,(.+)$/.exec(data);
  if (!mimeMatch) {
    return Response.json({ error: "Unsupported file format." }, { status: 400 });
  }
  const mime = mimeMatch[1];
  const base64 = mimeMatch[2];
  const ext = MIME_EXT[mime] ?? (kind === "voice" ? "webm" : kind === "video" ? "mp4" : "jpg");

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_BYTES) {
    return Response.json({ error: "File is too large (max 25 MB)." }, { status: 400 });
  }

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-media").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    return Response.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
  return Response.json({ ok: true, url: pub.publicUrl, kind: kind ?? "image" });
}
