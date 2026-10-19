import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
      "audio/x-m4a",
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
 * POST /api/chat/media — multipart upload (voice note / photo / video).
 * Multipart instead of base64 JSON: ~35% smaller payloads and no body-bloat
 * failures, which is what was killing voice and video delivery.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "A multipart upload is required." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const rule = RULES[kind];
  if (!(file instanceof File) || !rule) {
    return Response.json({ error: "A valid file and kind are required." }, { status: 400 });
  }

  /* The conversation this attachment belongs to. Storing it is what makes
     GET /api/chat/media/:id authorisable — without a match link there is no
     way to prove the fetcher is a participant, which is why that route was
     previously wide open. Uploading into someone else's conversation is not a
     thing a member should be able to do either. */
  const matchId = String(form.get("match") ?? "");
  if (!matchId) {
    return Response.json({ error: "match is required." }, { status: 400 });
  }
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.id, matchId),
        or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
      ),
    )
    .limit(1);
  if (!match) {
    return Response.json({ error: "Match not found." }, { status: 404 });
  }

  const mime = (file.type || "").split(";")[0];
  if (!rule.mimes.has(mime) && !rule.mimes.has(file.type)) {
    return Response.json({ error: `Unsupported ${kind} format (${file.type || "unknown"}).` }, { status: 400 });
  }
  if (file.size > rule.maxBytes) {
    return Response.json(
      { error: `${kind === "voice" ? "Voice note" : "File"} too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).` },
      { status: 400 }
    );
  }
  if (rateLimited(member.id, 200, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many uploads — try again later." }, { status: 429 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const [row] = await db
    .insert(chatMedia)
    .values({ senderId: member.id, matchId, kind, mime, data: bytes })
    .returning({ id: chatMedia.id });

  return Response.json({ ok: true, id: row.id, kind });
}
