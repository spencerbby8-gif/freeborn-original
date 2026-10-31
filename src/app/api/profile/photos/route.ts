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
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";
import { deriveAnchor, hashImageBytes } from "@/lib/photo-hash";
import { findDuplicatePhotos, findSharedAnchor, openCase, recordDuplicatePhotoHits, recomputeTrust, upsertFingerprint } from "@/lib/identity-resolve";

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
 *   - unclear with the engines RUNNING → photo added and the seal revoked
 *     until re-verification, so doubt never keeps an unchecked photo sealed;
 *   - unclear because the engines COULD NOT RUN (error or rate limit) → photo
 *     added and verification left exactly as it was. Doubt about the check is
 *     not doubt about the member, and revoking on an outage punished every
 *     verified member for it.
 *     Doubt never locks a member out of their profile.
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
     outright; a confident match keeps the seal; an unclear verdict from a
     running check revokes the seal; an unavailable check leaves verification
     untouched and says so in the response. --------------------------------- */
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
        /* This row is a receipt, not an accusation, and it never passes through
           the two-engine triage in /api/reports, so severity stays null. Marking
           the origin is what stops it reading as an untriaged member complaint in
           the operator queue. */
        origin: "identity_gate",
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

  /* CROSS-ACCOUNT DUPLICATE CHECK. Both perceptual hashes are computed here, from
     the bytes we just took custody of, so an image re-uploaded under a different
     filename, resized or recompressed still matches. `null` means "the check could
     not run" and is never reported as "clean". */
  const hashes = await hashImageBytes(bytes);
  const dup = hashes
    ? await findDuplicatePhotos(member.id, { d: hashes.d, a: hashes.a, bytes: hashes.bytes })
    : { hits: [], scanned: 0, truncated: false, error: "hasher-unavailable" };

  const isFirst = existing.length === 0;
  const [photoRow] = await db
    .insert(profilePhotos)
    .values({
      userId: member.id,
      storagePath: `/api/chat/media/${media.id}`,
      isPrimary: isFirst,
      position: existing.length,
      phashD: hashes?.d ?? null,
      phashA: hashes?.a ?? null,
      phashBytes: hashes?.bytes ?? null,
      phashAt: hashes ? new Date() : null,
    })
    .returning({ id: profilePhotos.id });

  if (dup.hits.length) {
    try {
      await recordDuplicatePhotoHits(member.id, dup.hits.length);
      const worst = dup.hits.reduce((a, b) => (Number(b.distance ?? -1) < Number(a.distance ?? -1) ? b : a));
      await openCase({
        userId: member.id,
        email: member.email ?? null,
        input: {
          code: "photo_reused_across_accounts",
          violatedClass: "violation_profile_content",
          detail: `Upload ${photoRow?.id ?? "?"} ${worst.distance === null ? "is the BYTE-IDENTICAL FILE" : `is within ${worst.distance}/64 bits`} of a photo on ${worst.userId}${worst.suspended ? " (that account is currently suspended)" : ""}. Scanned ${dup.scanned} hashed photos${dup.truncated ? " (scan truncated at the row cap)" : ""}.`,
          notes:
            "One of your photos is already on another account. If you own both, say so in your appeal; if someone else supplied this photo, replace it and re-verify.",
          trustDelta: worst.exact ? -28 : -14,
          openedBy: "system",
        },
      });
    } catch {
      /* a duplicate finding must not fail an upload that the member is entitled to make */
    }
  }

  /* Identity anchor: recompute from ALL of this member's hashed photos and look for
     the same anchor elsewhere. This is the non-biometric analogue of "the same face
     is on several accounts", derived only from photos we already hold. */
  if (hashes) {
    try {
      const mine = await db
        .select({ d: profilePhotos.phashD, a: profilePhotos.phashA })
        .from(profilePhotos)
        .where(eq(profilePhotos.userId, member.id));
      const anchor = await deriveAnchor(
        mine
          .filter((r) => typeof r.d === "string")
          .map((r) => ({ d: r.d as string, a: typeof r.a === "string" ? r.a : undefined }))
      );
      const shared = anchor ? await findSharedAnchor(member.id, anchor) : { users: [], suspended: 0, scanned: 0 };
      await upsertFingerprint({
        userId: member.id,
        source: "photo_upload",
        hashes,
        anchor,
        engine: identityMatch ? { decision: identityMatch.decision, confidence: identityMatch.confidence } : null,
      });
      if (shared.users.length) {
        await openCase({
          userId: member.id,
          email: member.email ?? null,
          input: {
            code: "identity_anchor_shared",
            violatedClass: "violation_identity",
            detail: `Photo-set anchor ${anchor} also held by ${shared.users.slice(0, 5).join(", ")}${shared.users.length > 5 ? ` (+${shared.users.length - 5} more)` : ""}; ${shared.suspended} of those accounts are suspended.`,
            notes:
              "Your photos line up with another account on Freeborn. Verified members can clear this by re-verifying; a duplicate account cannot be kept alongside the original.",
            trustDelta: -28,
            openedBy: "system",
            verified,
          },
        });
      }
      await recomputeTrust(member.id);
    } catch {
      /* never fail the upload for the dedup layer */
    }
  }

  /* Seal handling. Four outcomes for a verified member:

       match       the engines compared the photo and agreed. Seal stays.
       mismatch    rejected with 409 above, before reaching this point.
       unclear,    the engines ran and could not reach a verdict. That is doubt
       engines     about the PHOTO, so the seal is revoked until
       ran         re-verification. This is what Privacy clause 7 and /safety
                   promise, and it is what keeps the badge honest.
       unclear,    the engines produced no verdict at all (engine "none",
       engines     "error" or "rate-limited"). That is doubt about the CHECK,
       down        not about the member. Revoking on it punished every
                   verified member for an outage, and with vision unavailable
                   on both configured engines it fired on every single
                   upload.
                   Verification is left exactly as it was, and the response
                   carries checkUnavailable so the UI can say the check did
                   not run instead of implying a judgement was made.

     Nothing here claims a human will review an unclear result, because no
     review surface exists anywhere in this codebase. */
  /* "dual" and "single" are only ever returned by identity-match.ts when at
     least one engine produced a parsed verdict (lines 150-182). Every other
     engine value means no verdict exists: "none" (no baselines, image prep
     failed, or both engines errored, e.g. the 400 both configured vision
     providers return today), "error" (budget exceeded or threw), and
     "rate-limited" (set by this route). Testing the engine value rather than
     the decision is what separates "the check looked and doubted" from "the
     check never looked". A first cut of this fix tested only error and
     rate-limited, which would have kept revoking on today's "none". */
  const checkRan =
    identityMatch !== null &&
    (identityMatch.engine === "dual" || identityMatch.engine === "single");

  let revoked = false;
  if (verified && checkRan && identityMatch !== null && identityMatch.decision !== "match") {
    await db
      .update(userProfiles)
      .set({ isVerified: false })
      .where(eq(userProfiles.id, member.id));
    revoked = true;
  }

  return Response.json({
    ok: true,
    revoked,
    checkUnavailable: identityMatch !== null && !checkRan,
    ...(identityMatch ? { identityMatch } : {}),
    /* Honest reporting of the duplicate layer: `checked:false` means no verdict
       about reuse exists, not that none was found. */
    duplicateCheck: {
      checked: dup.error === null,
      matches: dup.hits.length,
      exact: dup.hits.some((h) => h.exact),
      suspendedOwner: dup.hits.some((h) => h.suspended),
      scanned: dup.scanned,
      truncated: dup.truncated,
      reason: dup.hits.length ? "photo_already_on_another_account" : dup.error ?? "no_match",
    },
  });
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
      { ok: false, error: "That photo lives in your original upload store, so it can't be removed from this preview room." },
      { status: 404 }
    );
  }

  await db.delete(profilePhotos).where(eq(profilePhotos.id, row.id));

  /* Delete the bytes too. `profile-photos` is a PUBLIC bucket with a
     bucket-wide read policy, so a row deleted without its object leaves the
     image retrievable by URL forever — a member who removes a photo (or whose
     account is deleted) would otherwise still have it live on the internet.
     Production evidence 2026-10-30: 11 objects vs 10 bucket-shaped rows, i.e.
     exactly one orphan. Two rules keep this safe:
       * the object path is taken from `row.storagePath`, NEVER from the
         request body, so a caller cannot name an arbitrary object; and
       * only the bucket-relative shape is removed (no leading slash, no
         scheme). `chat_media` blobs and mirrored `/uploads/` paths are not
         bucket objects.
     The bucket's DELETE policy is owner-scoped, so this client can only ever
     remove this member's own folder. Failure is logged, not surfaced: the row
     is already gone and telling the member their photo is still there after it
     isn't would be worse than a warning. */
  if (!row.storagePath.startsWith("/") && !/^https?:\/\//.test(row.storagePath)) {
    try {
      const supabase = await createSupabaseClientForApi(request);
      const { error } = await supabase.storage.from("profile-photos").remove([row.storagePath]);
      if (error) {
        console.warn("[profile-photos] deleted row but the object remains:", error.message);
      }
    } catch (err) {
      console.warn("[profile-photos] object removal failed:", (err as Error).message);
    }
  }

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
