import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messages, userSwipes } from "@/db/schema";
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
    promptAnswers: Array.isArray(row.prompt_answers)
      ? (row.prompt_answers as Array<{ prompt?: string; answer?: string }>)
      : [],
  };

  /* --- Live stats (mirror /api/profile/[id] — same tables, same math) ------ */
  const myMatchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(sql`${matches.userA} = ${user.id} or ${matches.userB} = ${user.id}`);
  const myMatchIds = new Set(myMatchRows.map((m) => m.id));

  const incomingThreads = await db
    .select({ matchId: messages.matchId })
    .from(messages)
    .where(ne(messages.senderId, user.id))
    .groupBy(messages.matchId);
  const outgoingThreads = await db
    .select({ matchId: messages.matchId })
    .from(messages)
    .where(eq(messages.senderId, user.id))
    .groupBy(messages.matchId);

  const receivedThreads = new Set(
    incomingThreads.map((r) => r.matchId).filter((matchId) => myMatchIds.has(matchId))
  );
  const answeredThreads = new Set(outgoingThreads.map((r) => r.matchId));
  const repliedCount = [...receivedThreads].filter((matchId) => answeredThreads.has(matchId)).length;
  const replyRate =
    receivedThreads.size > 0
      ? Math.min(100, Math.round((repliedCount / receivedThreads.size) * 100))
      : null;

  const [likesReceived] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, user.id), eq(userSwipes.action, "like")));
  const likesIn = likesReceived?.count ?? 0;
  const matchesN = myMatchRows.length;
  const matchRate = likesIn > 0 ? Math.min(100, Math.round((matchesN / likesIn) * 100)) : null;

  /* --- Completeness v2: every counted item is listed for the checklist ------
     15 profile fields + prompts answered + at least one photo + a photo
     foundation (3+). The UI shows exactly these — nothing hidden. */
  const source = { ...profile, birthDate: row.birth_date };
  const promptsAnswered = (profile.promptAnswers ?? []).filter((p) => p.answer?.trim()).length;
  const hasPhoto = photoUrls.length > 0;
  const hasPhotoFoundation = photoUrls.length >= 3;

  const items: Array<{ id: string; label: string; done: boolean; target: string }> = [
    ...COMPLETENESS_FIELDS.map((f) => ({
      id: f,
      label: FIELD_LABELS[f],
      done: (source as Record<string, unknown>)[f] != null && String((source as Record<string, unknown>)[f]).trim() !== "",
      target: f === "birthDate" || f === "gender" ? "onboarding" : `edit:${f}`,
    })),
    { id: "prompts", label: "Answer one profile prompt", done: promptsAnswered > 0, target: "prompts" },
    { id: "photo", label: "Add a profile photo", done: hasPhoto, target: "photos" },
    { id: "photoFoundation", label: "Reach a 3-photo foundation", done: hasPhotoFoundation, target: "photos" },
  ];
  const filled = items.filter((i) => i.done).length;
  const total = items.length;
  const completeness = Math.round((filled / total) * 100);

  return Response.json({
    profile,
    completeness,
    filled,
    total,
    items,
    stats: { replyRate, matchRate, conversationCount: receivedThreads.size },
  });
}

const FIELD_LABELS: Record<string, string> = {
  displayName: "Add your display name",
  birthDate: "Confirm your birth date",
  gender: "Set your gender",
  city: "Add your city",
  bio: "Write a short bio",
  occupation: "Add your occupation",
  language: "Add your language",
  religion: "Add your religion or stance",
  maritalStatus: "Add your marital status",
  hasKids: "Say whether you have kids",
  wantsKids: "Say whether you want kids",
  drinking: "Add your drinking stance",
  smoking: "Add your smoking stance",
  educationLevel: "Add your education level",
  heightCmProfile: "Add your height",
};

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

  /* Prompt answers — strict shape: array of {prompt, answer}, answer capped,
     list capped. Stored as jsonb; malformed input is rejected, not coerced. */
  if (bodyObj.promptAnswers !== undefined) {
    if (!Array.isArray(bodyObj.promptAnswers)) {
      return Response.json({ error: "promptAnswers must be an array." }, { status: 400 });
    }
    const cleaned = bodyObj.promptAnswers
      .slice(0, 6)
      .filter((p): p is { prompt: string; answer: string } => {
        if (typeof p !== "object" || p === null) return false;
        const { prompt, answer } = p as Record<string, unknown>;
        return typeof prompt === "string" && typeof answer === "string" && answer.trim().length > 0;
      })
      .map((p) => ({
        prompt: p.prompt.slice(0, 120),
        answer: p.answer.trim().slice(0, 500),
      }));
    patch.prompt_answers = cleaned;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await supabase.from("user_profiles").update(patch).eq("id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
