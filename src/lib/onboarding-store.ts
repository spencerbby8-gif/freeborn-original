import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  chatMedia,
  profilePhotos as localProfilePhotos, // same table as `profilePhotos`; the alias predates the storage fallback
  userProfiles as localUserProfiles,
} from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EMPTY_DRAFT,
  genderOptions,
  relationshipGoalOptions,
  STEP_ORDER,
  type OnboardingDraft,
  type OnboardingStepName,
} from "@/lib/onboarding-data";

/* --- label ↔ value maps (UI labels vs Freeborn stored values) ----------- */

const genderLabelToValue = new Map(genderOptions.map((g) => [g.label, g.value]));
const genderValueToLabel = new Map(genderOptions.map((g) => [g.value, g.label]));
const intentLabelToValue = new Map(relationshipGoalOptions.map((g) => [g.label, g.value]));
const intentValueToLabel = new Map(relationshipGoalOptions.map((g) => [g.value, g.label]));

type SbProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  birth_date: string | null;
  gender: string | null;
  city: string | null;
  region: string | null;
  bio: string | null;
  occupation: string | null;
  education: string | null;
  relationship_goals: string[] | null;
  values: string[] | null;
  interests: string[] | null;
  lifestyle_preferences: string[] | null;
  deal_breakers: string[] | null;
  onboarding_stage: string;
  onboarding_step: string;
  onboarding_completed_at: string | null;
};

type SbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadProfileRow(
  userId: string,
  supabaseOverride?: SbClient
): Promise<SbProfileRow | null> {
  const supabase = supabaseOverride ?? (await createSupabaseServerClient());
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return (data as SbProfileRow | null) ?? null;
}

export async function ensureProfileRow(
  userId: string,
  email: string,
  supabaseOverride?: SbClient
) {
  const supabase = supabaseOverride ?? (await createSupabaseServerClient());
  const existing = await loadProfileRow(userId, supabase);
  if (existing) return existing;
  await supabase.from("user_profiles").insert({ id: userId, email });
  return loadProfileRow(userId, supabase);
}

/* --- load ---------------------------------------------------------------- */

/**
 * Resolves a member's photos. Primary source: Supabase (Storage-backed rows).
 * Fallback: the local mirror written when the storage bucket is unavailable —
 * so uploaded photos are never lost to onboarding either way.
 */
export async function photosForUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<Array<{ id: string; src: string; isCover: boolean }>> {
  const { data } = await supabase
    .from("profile_photos")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  const rows = (data ?? []) as Array<{
    id: string;
    storage_path: string;
    is_primary: boolean;
  }>;

  if (rows.length) {
    const resolved = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        src: /^https?:\/\//.test(row.storage_path)
          ? row.storage_path
          : supabase.storage.from("profile-photos").getPublicUrl(row.storage_path).data
              .publicUrl,
        isCover: row.is_primary,
      }))
    );
    return resolved;
  }

  const mirror = await db
    .select()
    .from(localProfilePhotos)
    .where(eq(localProfilePhotos.userId, userId))
    .orderBy(localProfilePhotos.position);

  return mirror.map((row) => ({
    id: row.id,
    src: row.storagePath,
    isCover: row.isPrimary,
  }));
}

export async function draftFromDb(
  userId: string,
  supabaseOverride?: SbClient
): Promise<OnboardingDraft> {
  const supabase = supabaseOverride ?? (await createSupabaseServerClient());
  const profile = await loadProfileRow(userId, supabase);
  if (!profile) return EMPTY_DRAFT;

  const [locRes, prefsRes, selfieRes] = await Promise.all([
    supabase.from("user_private_locations").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("discovery_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("verification_selfie_checks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  const location = locRes.data as {
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    source: string;
    country_code: string | null;
  } | null;
  const prefs = prefsRes.data as {
    age_min: number;
    age_max: number;
    distance_km: number;
    show_genders: string[];
    relationship_intents: string[];
    verified_only: boolean;
    photos_required: boolean;
  } | null;
  const selfie = (selfieRes.data ?? [])[0] as { created_at: string } | undefined;

  // Primary: Supabase Storage-backed rows. Fallback: local mirror — photos
  // are never lost to onboarding either way.
  const resolvedPhotos = await photosForUser(supabase, userId);

  return {
    ...EMPTY_DRAFT,
    display_name: profile.display_name ?? "",
    birth_date: profile.birth_date ?? "",
    gender: profile.gender ?? "",
    city: profile.city ?? "",
    region: profile.region ?? "",
    country_code: location?.country_code ?? "",
    location_source: ((location?.source as "manual" | "gps") ?? "manual") || "manual",
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracy_m: location?.accuracy_m ?? null,
    bio: profile.bio ?? "",
    relationship_goals: profile.relationship_goals ?? [],
    values: profile.values ?? [],
    interests: profile.interests ?? [],
    lifestyle_preferences: profile.lifestyle_preferences ?? [],
    deal_breakers: profile.deal_breakers ?? [],
    occupation: profile.occupation ?? "",
    education: profile.education ?? "",
    vaccinationStatus: (profile as { vaccination_status?: string }).vaccination_status ?? "prefer_not_to_say",
    age_min: prefs?.age_min ?? EMPTY_DRAFT.age_min,
    age_max: prefs?.age_max ?? EMPTY_DRAFT.age_max,
    distance_km: prefs?.distance_km ?? EMPTY_DRAFT.distance_km,
    show_genders: (prefs?.show_genders ?? []).map((v) => genderValueToLabel.get(v) ?? v),
    relationship_intents: (prefs?.relationship_intents ?? []).map(
      (v) => intentValueToLabel.get(v) ?? v
    ),
    verified_only: prefs?.verified_only ?? false,
    photos_required: prefs?.photos_required ?? true,
    photos: resolvedPhotos,
    verification: selfie
      ? { status: "submitted", submittedAt: selfie.created_at }
      : { status: "none" },
  };
}

/* --- photos --------------------------------------------------------------- */

/**
 * Storage refused the upload (or is down) — keep the photo, and keep it SERVED.
 *
 * This function used to write the bytes to `public/uploads/<id>.<ext>` and store
 * that path in `profile_photos.storage_path`. That could never work where the
 * product actually runs: a Vercel deployment has a read-only, per-invocation
 * filesystem, and src/lib/photo-url.ts hands `/uploads/...` straight back to the
 * browser — which asks a Next.js server for a file that exists, if at all, only
 * on the instance that took the upload. The row is healthy, the image is
 * missing, and there is nothing to recover. Every storage hiccup during
 * onboarding would have minted another permanently broken photo, silently,
 * because the caller ignored the upload error.
 *
 * So mirror the store the photo manager already uses successfully: bytes go into
 * `chat_media` (Postgres, replicated with the database, no filesystem involved)
 * and the row points at `/api/chat/media/<id>`, which `GET /api/chat/media/:id`
 * authorizes for exactly this shape of row — including the "published as a
 * profile photo" branch added for it. Returns null when the draft holds nothing
 * image-shaped, so the caller can say so instead of inventing a path.
 */
async function storePhotoBytesInDatabase(userId: string, dataUrl: string): Promise<string | null> {
  const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] === "png" ? "image/png" : "image/jpeg";
  const bytes = Buffer.from(match[2], "base64");

  // These two rows exist to satisfy the foreign keys the mirror relied on; both
  // are no-ops for a member who already has them.
  await db
    .insert(accounts)
    .values({ id: userId, email: `${userId}@mirror.local` })
    .onConflictDoNothing({ target: accounts.id });
  await db
    .insert(localUserProfiles)
    .values({ id: userId, email: `${userId}@mirror.local`, discoverable: false })
    .onConflictDoNothing({ target: localUserProfiles.id });

  const [media] = await db
    .insert(chatMedia)
    .values({ senderId: userId, kind: "image", mime, data: bytes })
    .returning({ id: chatMedia.id });
  if (!media) return null;
  return `/api/chat/media/${media.id}`;
}

async function savePhotos(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  photos: OnboardingDraft["photos"]
) {
  /* Re-saving onboarding replaces the whole set. Deleting the rows without
     deleting their objects leaks a public, permanently retrievable bucket object
     on every re-save — production held exactly one such orphan when this was
     measured (11 objects vs 10 rows). Paths come from the database, never from
     the draft, so a caller cannot name an arbitrary object, and the bucket's
     owner-scoped DELETE policy limits removal to this member's own folder. */
  const { data: previous } = await supabase
    .from("profile_photos")
    .select("storage_path")
    .eq("user_id", userId);
  const removable = ((previous ?? []) as Array<{ storage_path: string }>)
    .map((row) => row.storage_path)
    .filter((p) => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !/^https?:\/\//.test(p));
  if (removable.length > 0) {
    await supabase.storage.from("profile-photos").remove(removable);
  }
  await supabase.from("profile_photos").delete().eq("user_id", userId);

  let position = 0;
  for (const photo of photos.slice(0, 6)) {
    let storagePath: string | null = null;
    const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(photo.src);

    if (match) {
      const ext = match[1] === "png" ? "png" : "jpg";
      const path = `${userId}/${photo.id}.${ext}`;
      const bytes = Buffer.from(match[2], "base64");
      const { error } = await supabase.storage
        .from("profile-photos")
        .upload(path, new Uint8Array(bytes), {
          contentType: match[1] === "png" ? "image/png" : "image/jpeg",
          upsert: true,
        });
      if (!error) {
        storagePath = path;
      } else {
        console.warn(`[onboarding] photo ${photo.id} was not stored: ${error.message}`);
      }
    } else if (/^https?:\/\//.test(photo.src)) {
      storagePath = photo.src;
    }

    if (storagePath) {
      await supabase.from("profile_photos").insert({
        user_id: userId,
        storage_path: storagePath,
        position: position++,
        is_primary: photo.isCover,
      });
    } else {
      // No bucket object — store the bytes where they can still be served, and
      // never write a path the deployment cannot read back.
      const mirrored = await storePhotoBytesInDatabase(userId, photo.src);
      if (mirrored) {
        await db.insert(localProfilePhotos).values({
          userId,
          storagePath: mirrored,
          position: position++,
          isPrimary: photo.isCover,
        });
      } else {
        console.warn(`[onboarding] photo ${photo.id} could not be stored; it is not on the profile.`);
      }
    }
  }

  // Count reflects what is actually stored — Supabase or mirror alike.
  await supabase
    .from("user_profiles")
    .update({ photo_count: Math.min(photos.length, 6) })
    .eq("id", userId);
}

/* --- apply a step patch ----------------------------------------------------- */

export async function applyStepPatch(
  userId: string,
  email: string,
  step: OnboardingStepName,
  patch: Partial<OnboardingDraft>,
  supabaseOverride?: SbClient
): Promise<OnboardingStepName> {
  const supabase = supabaseOverride ?? (await createSupabaseServerClient());
  const stepIndex = STEP_ORDER.indexOf(step);
  const nextStep = STEP_ORDER[Math.min(stepIndex + 1, STEP_ORDER.length - 1)];

  const profilePatch: Record<string, unknown> = { onboarding_step: nextStep };
  const has = (key: keyof OnboardingDraft) => patch[key] !== undefined;

  if (has("display_name")) profilePatch.display_name = patch.display_name;
  if (has("birth_date")) profilePatch.birth_date = patch.birth_date;
  if (has("gender")) profilePatch.gender = patch.gender;
  if (has("city")) profilePatch.city = patch.city;
  if (has("region")) profilePatch.region = patch.region;
  if (has("bio")) profilePatch.bio = patch.bio;
  if (has("occupation")) profilePatch.occupation = patch.occupation;
  if (has("education")) profilePatch.education = patch.education;
  if (has("vaccinationStatus")) profilePatch.vaccination_status = patch.vaccinationStatus;
  if (has("relationship_goals")) profilePatch.relationship_goals = patch.relationship_goals;
  if (has("values")) profilePatch.values = patch.values;
  if (has("interests")) profilePatch.interests = patch.interests;
  if (has("lifestyle_preferences"))
    profilePatch.lifestyle_preferences = patch.lifestyle_preferences;
  if (has("deal_breakers")) profilePatch.deal_breakers = patch.deal_breakers;

  if (stepIndex >= STEP_ORDER.indexOf("identity")) {
    profilePatch.onboarding_stage = "profile_setup";
  }

  await supabase.from("user_profiles").update(profilePatch).eq("id", userId);

  if (has("city") || has("region") || has("location_source") || has("latitude")) {
    await supabase.from("user_private_locations").upsert(
      {
        user_id: userId,
        latitude: patch.latitude ?? null,
        longitude: patch.longitude ?? null,
        accuracy_m: patch.accuracy_m ?? null,
        source: patch.location_source ?? "manual",
        city: patch.city ?? "",
        region: patch.region ?? "",
        country_code: patch.country_code || null,
      },
      { onConflict: "user_id" }
    );
  }

  const prefsTouched =
    has("age_min") ||
    has("age_max") ||
    has("distance_km") ||
    has("show_genders") ||
    has("relationship_intents") ||
    has("verified_only") ||
    has("photos_required");

  if (prefsTouched) {
    const prefsPatch: Record<string, unknown> = { user_id: userId };
    if (has("age_min")) prefsPatch.age_min = patch.age_min;
    if (has("age_max")) prefsPatch.age_max = patch.age_max;
    if (has("distance_km")) prefsPatch.distance_km = patch.distance_km;
    if (has("show_genders"))
      prefsPatch.show_genders = (patch.show_genders ?? []).map(
        (label) => genderLabelToValue.get(label) ?? label
      );
    if (has("relationship_intents"))
      prefsPatch.relationship_intents = (patch.relationship_intents ?? []).map(
        (label) => intentLabelToValue.get(label) ?? label
      );
    if (has("verified_only")) prefsPatch.verified_only = patch.verified_only;
    if (has("photos_required")) prefsPatch.photos_required = patch.photos_required;

    await supabase
      .from("discovery_preferences")
      .upsert(prefsPatch, { onConflict: "user_id" });
  }

  if (has("photos")) {
    // Security rule: any new face photo invalidates the identity check until
    // the member re-verifies — mirrors /api/profile/photos exactly, so the
    // reminder comes back no matter which upload path was used.
    await supabase.from("user_profiles").update({ is_verified: false }).eq("id", userId);

    /* Photos must never block onboarding — but the retry has to land the bytes
       somewhere a browser can read back. The previous version of this catch
       wrote them to `public/uploads/` and stored that path, which on a read-only
       serverless filesystem means the profile shows a broken image forever. It
       now mirrors into Postgres via the same helper savePhotos uses. */
    try {
      await savePhotos(supabase, userId, patch.photos ?? []);
    } catch (err) {
      console.warn("[onboarding] photo save failed, mirroring to the database:", (err as Error).message);
      let position = 0;
      for (const photo of (patch.photos ?? []).slice(0, 6)) {
        const mirrored = await storePhotoBytesInDatabase(userId, photo.src);
        if (!mirrored) continue;
        await db
          .insert(accounts)
          .values({ id: userId, email: email || `${userId}@mirror.local` })
          .onConflictDoNothing({ target: accounts.id });
        await db
          .insert(localUserProfiles)
          .values({ id: userId, email: email || `${userId}@mirror.local`, discoverable: false })
          .onConflictDoNothing({ target: localUserProfiles.id });
        await db.insert(localProfilePhotos).values({
          userId,
          storagePath: mirrored,
          position: position++,
          isPrimary: photo.isCover,
        });
      }
      await supabase
        .from("user_profiles")
        .update({ photo_count: Math.min((patch.photos ?? []).length, 6) })
        .eq("id", userId);
    }
  }

  if (patch.verification?.status === "submitted" && patch.verification.selfie) {
    const existing = await supabase
      .from("verification_selfie_checks")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (!existing.data?.length) {
      const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(patch.verification.selfie);
      let path = `selfie-${userId}-${Date.now()}`;
      if (match) {
        const uploadPath = `${userId}/selfie-${Date.now()}.jpg`;
        const { error } = await supabase.storage
          .from("verification-selfies")
          .upload(uploadPath, new Uint8Array(Buffer.from(match[2], "base64")), {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (!error) path = uploadPath;
      }
      await supabase.from("verification_selfie_checks").insert({
        user_id: userId,
        storage_path: path,
        pose_id: "onboarding",
        pose_asset_path: "onboarding",
        status: "pending",
      });
    }
  }

  return nextStep;
}

/* --- completion -------------------------------------------------------------- */

export async function completeOnboarding(userId: string, supabaseOverride?: SbClient) {
  const supabase = supabaseOverride ?? (await createSupabaseServerClient());
  await supabase
    .from("user_profiles")
    .update({
      profile_status: "active",
      onboarding_stage: "ready",
      onboarding_step: "finish",
      onboarding_completed_at: new Date().toISOString(),
      discoverable: true,
    })
    .eq("id", userId);
}

/* --- local preview-room helpers ----------------------------------------------- */

export async function getPreviewVisitorProfileId(): Promise<string | null> {
  const [row] = await db
    .select({ id: localUserProfiles.id })
    .from(localUserProfiles)
    .where(eq(localUserProfiles.handle, "preview_visitor"))
    .limit(1);
  return row?.id ?? null;
}

export async function ensureLocalMirrorProfile(userId: string, email: string) {
  await db
    .insert(accounts)
    .values({ id: userId, email })
    .onConflictDoNothing({ target: accounts.id });
  await db
    .insert(localUserProfiles)
    .values({ id: userId, email, discoverable: false })
    .onConflictDoNothing({ target: localUserProfiles.id });
}
