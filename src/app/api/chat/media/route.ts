import { db } from "@/db";
import { chatMedia } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

/* Strict per-kind whitelists and caps — keeps the store safe and fast. */
const RULES: Record<string, { mimes: Set<string>; maxBytes: number }> = {
  image: {
    mimes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    maxBytes: 8 * 1024 * 1024,
  },
  video: {
    mimes: new Set(["video/mp4", "video/webm", "video/quicktime"]),
    maxBytes: 20 * 1024 * 1024,
  },
  voice: {
    mimes: new Set([
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/webm;codecs=opus",
    ]),
    maxBytes: 8 * 1024 * 1024,
  },
};

const submitLog = new Map<string, number[]>();

function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (submitLog.get(accountId) ?? []).filter((t) => now - t < windowMs);
  submitLog.set(accountId, hits);
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

/**
 * POST /api/chat/media
 * Stores a chat attachment (voice note / photo / video) in the local media
 * table and returns its id. The matching GET route streams it back, so both
 * sides of a conversation can play or view it with zero external deps.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data, kind } = (body ?? {}) as { data?: string; kind?: string };
  const rule = RULES[kind ?? ""];
  if (!data || !data.startsWith("data:") || !rule) {
    return Response.json({ error: "A valid attachment is required." }, { status: 400 });
  }

  const mimeMatch = /^data:([^;]+);base64,(.+)$/.exec(data);
  if (!mimeMatch) {
    return Response.json({ error: "Unsupported attachment format." }, { status: 400 });
  }
  const mime = mimeMatch[1];
  const base64 = mimeMatch[2];
  if (!rule.mimes.has(mime)) {
    return Response.json({ error: "Unsupported attachment type." }, { status: 400 });
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > rule.maxBytes) {
    return Response.json(
      { error: `Attachment too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).` },
      { status: 400 }
    );
  }

  if (rateLimited(member.id, 40, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many uploads — try again later." }, { status: 429 });
  }

  const [row] = await db
    .insert(chatMedia)
    .values({ senderId: member.id, kind: kind as string, mime, data: bytes })
    .returning({ id: chatMedia.id });

  return Response.json({ ok: true, id: row.id, kind });
}
