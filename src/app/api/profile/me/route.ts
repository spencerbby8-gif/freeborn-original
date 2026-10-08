import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";

export const dynamic = "force-dynamic";

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const COMPLETENESS_FIELDS = [
  "displayName",
  "birthDate",
  "gender",
  "city",
  "bio",
  "occupation",
  "language",
  "religion",
  "maritalStatus",
  "hasKids",
  "wantsKids",
  "drinking",
  "smoking",
  "educationLevel",
  "heightCmProfile",
] as const;

export async function GET(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const { data: row } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!row) return Response.json({ error: "Profile not found." }, { status: 404 });

  const { data: photos } = await supabase
    .from("profile_photos")
    .select("storage_path, is_primary")
    .eq("user_id", user.id)
    .order("position", { ascending: true });

  const photoUrls = (photos ?? []).map((p) => resolvePhotoUrl(p.storage_path as string));

  const profile = {
    id: user.id,
    displayName: row.display_name ?? "",
    age: ageFromBirthDate(row.birth_date ?? null),
    gender: row.gender ?? "",
    city: row.city ?? "",
    region: row.region ?? "",
    bio: row.bio ?? "",
    occupation: row.occupation ?? "",
    education: row.education ?? "",
    language: row.language ?? "",
    religion: row.religion ?? "",
    maritalStatus: row.marital_status ?? "",
    hasKids: row.has_kids ?? "",
    wantsKids: row.wants_kids ?? "",
    drinking: row.drinking ?? "",
    smoking: row.smoking ?? "",
    educationLevel: row.education_level ?? "",
    heightCmProfile: row.height_cm_profile ?? null,
    vaccinationStatus: row.vaccination_status ?? "prefer_not_to_say",
    values: row.values ?? [],
    interests: row.interests ?? [],
    lifestyle: row.lifestyle_preferences ?? [],
    relationshipGoals: row.relationship_goals ?? [],
    photos: photoUrls,
    isVerified: row.is_verified ?? false,
    messagePrivacy: row.message_privacy ?? "everyone",
    discoverPrivacy: row.discover_privacy ?? "everyone",
    memberSince: row.created_at,
  };

  const source = { ...profile, birthDate: row.birth_date };
  let filled = 0;
  for (const f of COMPLETENESS_FIELDS) {
    const v = (source as Record<string, unknown>)[f];
    if (v != null && String(v).trim() !== "") filled++;
  }
  if (photoUrls.length > 0) filled++;
  const total = COMPLETENESS_FIELDS.length + 1;
  const completeness = Math.round((filled / total) * 100);

  return Response.json({ profile, completeness, filled, total });
}

const COLUMN: Record<string, string> = {
  displayName: "display_name",
  bio: "bio",
  occupation: "occupation",
  education: "education",
  language: "language",
  religion: "religion",
  maritalStatus: "marital_status",
  hasKids: "has_kids",
  wantsKids: "wants_kids",
  drinking: "drinking",
  smoking: "smoking",
  educationLevel: "education_level",
  heightCmProfile: "height_cm_profile",
  city: "city",
  region: "region",
  vaccinationStatus: "vaccination_status",
};

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

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(COLUMN)) {
    const value = (body as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (key === "heightCmProfile") {
      const n = Number(value);
      patch[COLUMN[key]] = Number.isFinite(n) && n > 0 ? n : null;
    } else if (typeof value === "string") {
      patch[COLUMN[key]] = value.trim();
    }
  }

  /* Privacy settings — validated against the three real options. */
  const PRIVACY_VALUES = new Set(["everyone", "verified", "unvaccinated"]);
  const bodyObj = body as Record<string, unknown>;
  if (typeof bodyObj.messagePrivacy === "string" && PRIVACY_VALUES.has(bodyObj.messagePrivacy)) {
    patch.message_privacy = bodyObj.messagePrivacy;
  }
  if (typeof bodyObj.discoverPrivacy === "string" && PRIVACY_VALUES.has(bodyObj.discoverPrivacy)) {
    patch.discover_privacy = bodyObj.discoverPrivacy;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await supabase.from("user_profiles").update(patch).eq("id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
