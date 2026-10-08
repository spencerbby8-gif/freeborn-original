import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 6;

/**
 * POST /api/profile/photos
 * Adds a new profile photo. Security rule: a new face-photo invalidates the
 * teal seal, so any approved verification is revoked (is_verified=false) and
 * the member must re-verify. The client warns about this before uploading.
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

  /* Reorder branch: { action: "reorder", order: [urls...] } — persists the
     member's chosen photo order (drag or arrows in the manager). */
  const maybe = (body ?? {}) as { action?: string; order?: string[] };
  if (maybe.action === "reorder") {
    const order = Array.isArray(maybe.order) ? maybe.order : [];
    if (order.length === 0) return Response.json({ error: "order is required." }, { status: 400 });
    const rows = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, member.id));
    for (let pos = 0; pos < order.length; pos++) {
      const url = order[pos];
      const row = rows.find((r) => r.storagePath === url || url.endsWith(r.storagePath));
      if (!row) continue;
      await db
        .update(profilePhotos)
        .set({ position: pos, isPrimary: pos === 0 })
        .where(eq(profilePhotos.id, row.id));
    }
    return Response.json({ ok: true });
  }

  const { data } = (body ?? {}) as { data?: string };
  const mimeMatch = data ? /^data:([^;]+);base64,(.+)$/.exec(data) : null;
  if (!mimeMatch || !MIMES.has(mimeMatch[1])) {
    return Response.json(
      { error: "A JPEG, PNG or WebP photo is required." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(mimeMatch[2], "base64");
  if (bytes.length > MAX_BYTES) {
    return Response.json({ error: "Photo too large (max 8 MB)." }, { status: 400 });
  }

  const existing = await db
    .select({ id: profilePhotos.id })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, member.id));
  if (existing.length >= MAX_PHOTOS) {
    return Response.json(
      { error: `Profile photos are capped at ${MAX_PHOTOS}. Remove one first.` },
      { status: 400 }
    );
  }

  // Store the bytes in the local media table and point the photo row at it.
  const [media] = await db
    .insert(chatMedia)
    .values({ senderId: member.id, kind: "image", mime: mimeMatch[1], data: bytes })
    .returning({ id: chatMedia.id });

  const isFirst = existing.length === 0;
  await db.insert(profilePhotos).values({
    userId: member.id,
    storagePath: `/api/chat/media/${media.id}`,
    isPrimary: isFirst,
    position: existing.length,
  });

  // New photo → seal revoked until re-verification.
  const [me] = await db
    .select({ isVerified: userProfiles.isVerified })
    .from(userProfiles)
    .where(eq(userProfiles.id, member.id))
    .limit(1);
  let revoked = false;
  if (me?.isVerified) {
    await db
      .update(userProfiles)
      .set({ isVerified: false })
      .where(eq(userProfiles.id, member.id));
    revoked = true;
  }

  return Response.json({ ok: true, revoked });
}

/**
 * DELETE /api/profile/photos
 * Removes a member's own photo (local room photos; Supabase-stored originals
 * aren't touched here).
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { path } = (body ?? {}) as { path?: string };
  if (!path || typeof path !== "string") {
    return Response.json({ error: "path is required." }, { status: 400 });
  }

  /* Robust match: the client may pass the resolved URL (full storage URL or
     /api/chat/media/…), so match either exactly or by suffix. */
  const rows = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, member.id));
  const row = rows.find((r) => r.storagePath === path || path.endsWith(r.storagePath));
  if (!row) {
    return Response.json(
      { ok: false, error: "That photo lives in your original upload store — it can't be removed from this preview room." },
      { status: 404 }
    );
  }

  await db.delete(profilePhotos).where(eq(profilePhotos.id, row.id));
  const mediaMatch = /^\/api\/chat\/media\/([0-9a-f-]+)$/i.exec(path);
  if (mediaMatch) {
    try {
      await db.delete(chatMedia).where(eq(chatMedia.id, mediaMatch[1]));
    } catch {
      /* blob cleanup is best-effort */
    }
  }
  return Response.json({ ok: true });
}
