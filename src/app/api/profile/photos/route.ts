import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, profilePhotos, reports, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import {
  logIdentityCheck,
  matchRateLimited,
  runIdentityMatch,
} from "@/lib/identity-match";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 6;

/**
 * POST /api/profile/photos
 * Adds a new profile photo.
 *
 * IDENTITY MATCH GATE: a member who already passed live verification gets
 * their new photo checked against their verified references (the
 * live-verified selfie + existing profile photos) by up to two independent
 * vision engines.
 *   - confident SAME person → photo added, verification seal STAYS (no
 *     re-verification);
 *   - confident DIFFERENT person → upload rejected (409) and flagged to the
 *     moderation queue;
 *   - anything doubtful (disagreement / unclear / engines down / rate
 *     limited) → photo added but the seal is revoked — exactly the pre-gate
 *     behavior. Doubt never locks a member out, and doubt never keeps an
 *     unchecked photo sealed.
 * Unverified members are unaffected.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

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
  /* Validated above: a base64 image data URL of an allowed MIME type. */
  const photoData = data as string;

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

  /* --- Identity match gate (verified members only) -------------------------
     Runs BEFORE anything is stored: a confident mismatch rejects the upload
     outright; a confident match keeps the seal; doubt falls back to the
     pre-gate behavior (add + revoke). -------------------------------------- */
  const [me] = await db
    .select({ isVerified: userProfiles.isVerified })
    .from(userProfiles)
    .where(eq(userProfiles.id, member.id))
    .limit(1);
  const verified = Boolean(me?.isVerified);

  let identityMatch: {
    decision: "match" | "mismatch" | "unclear";
    engine: string;
    confidence: string;
  } | null = null;

  if (verified) {
    if (matchRateLimited(member.id)) {
      identityMatch = { decision: "unclear", engine: "rate-limited", confidence: "unknown" };
    } else {
      try {
        const origin = new URL(request.url).origin;
        const outcome = await runIdentityMatch(member.id, photoData, origin);
        identityMatch = {
          decision: outcome.decision,
          engine: outcome.engine,
          confidence: outcome.confidence,
        };
        await logIdentityCheck(member.id, outcome);
      } catch {
        identityMatch = { decision: "unclear", engine: "error", confidence: "unknown" };
      }
    }
  }

  if (identityMatch?.decision === "mismatch") {
    /* Flag to the moderation queue — a human can review and clear it. */
    try {
      await db.insert(reports).values({
        reporterId: member.id,
        subjectId: member.id,
        reason: "fake_profile",
        details: `Identity match gate rejected a new photo upload (engine=${identityMatch.engine}, confidence=${identityMatch.confidence}). The photo did not match the member's verified identity references. Member may re-verify with a fresh selfie.`,
        status: "open",
      });
    } catch {
      /* queue flag is best-effort */
    }
    return Response.json(
      {
        error: "identity-mismatch",
        message:
          "This photo doesn't appear to match your verified identity, so it wasn't added. Verify your identity again with a fresh selfie, then add the photo.",
        canReverify: true,
      },
      { status: 409 }
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

  /* Seal handling: a confirmed identity match keeps the verification; any
     other outcome for a verified member revokes it until re-verification
     (the pre-gate behavior). */
  let revoked = false;
  if (verified && identityMatch?.decision !== "match") {
    await db
      .update(userProfiles)
      .set({ isVerified: false })
      .where(eq(userProfiles.id, member.id));
    revoked = true;
  }

  return Response.json({ ok: true, revoked, ...(identityMatch ? { identityMatch } : {}) });
}

/**
 * DELETE /api/profile/photos
 * Removes a member's own photo (local room photos; Supabase-stored originals
 * aren't touched here).
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

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
