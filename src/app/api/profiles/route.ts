import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profilePhotos, userPrivateLocations, userProfiles, userSwipes } from "@/db/schema";

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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const list = (v: string | null) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const vax = url.searchParams.get("vax"); // any | vaccinated | unvaccinated
  const verifiedOnly = url.searchParams.get("verified") === "1";
  const onlineOnly = url.searchParams.get("online") === "1";
  const genders = list(url.searchParams.get("gender"));
  const lifestyle = list(url.searchParams.get("lifestyle"));
  const interests = list(url.searchParams.get("interests"));
  const intents = list(url.searchParams.get("intent"));
  const religions = list(url.searchParams.get("religion"));
  const marital = list(url.searchParams.get("marital"));
  const kids = list(url.searchParams.get("kids"));
  const drinking = list(url.searchParams.get("drinking"));
  const smoking = list(url.searchParams.get("smoking"));
  const languages = list(url.searchParams.get("language"));
  const ageMinParam = url.searchParams.get("ageMin");
  const ageMaxParam = url.searchParams.get("ageMax");
  const ageMin = ageMinParam !== null ? Number(ageMinParam) : NaN;
  const ageMax = ageMaxParam !== null ? Number(ageMaxParam) : NaN;
  const distanceParam = url.searchParams.get("distance");
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  // 500 means "Anywhere" — treat it (and anything above) as no cap at all.
  const distance =
    distanceParam !== null && Number(distanceParam) < 500 ? Number(distanceParam) : NaN;
  const fromLat = latParam !== null ? Number(latParam) : NaN;
  const fromLng = lngParam !== null ? Number(lngParam) : NaN;
  const haveOrigin = Number.isFinite(fromLat) && Number.isFinite(fromLng) && Number.isFinite(distance);

  const rows = await db
    .select()
    .from(userProfiles)
    .where(sql`${userProfiles.profileStatus} = 'active' and ${userProfiles.discoverable} = true and ${userProfiles.handle} is distinct from 'preview_visitor'`)
    .orderBy(userProfiles.createdAt);

  const likeRows = await db
    .select({ likedId: userSwipes.likedId, likeCount: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(eq(userSwipes.action, "like"))
    .groupBy(userSwipes.likedId);
  const countByProfile = new Map(likeRows.map((r) => [r.likedId, r.likeCount]));

  const photos = await db.select().from(profilePhotos);
  const photoByUser = new Map<string, { storagePath: string; isPrimary: boolean }>();
  const photosByUser = new Map<string, string[]>();
  const ordered = [...photos].sort((a, b) =>
    a.isPrimary === b.isPrimary ? a.position - b.position : a.isPrimary ? -1 : 1
  );
  for (const photo of ordered) {
    const existing = photoByUser.get(photo.userId);
    if (!existing || (photo.isPrimary && !existing.isPrimary)) photoByUser.set(photo.userId, photo);
    const l = photosByUser.get(photo.userId) ?? [];
    l.push(photo.storagePath);
    photosByUser.set(photo.userId, l);
  }

  const locations = await db.select().from(userPrivateLocations);
  const locByUser = new Map(locations.map((l) => [l.userId, l]));

  const nowMs = Date.now();
  const out = [];
  for (const row of rows) {
    const age = ageFromBirthDate(row.birthDate);
    const isOnline =
      row.lastActiveAt != null && nowMs - row.lastActiveAt.getTime() < ONLINE_WINDOW_MS;

    if (vax && vax !== "any" && row.vaccinationStatus !== vax) continue;
    if (verifiedOnly && !row.isVerified) continue;
    if (onlineOnly && !isOnline) continue;
    if (genders.length && (!row.gender || !genders.includes(row.gender))) continue;
    if (Number.isFinite(ageMin) && (age === null || age < ageMin)) continue;
    if (Number.isFinite(ageMax) && (age === null || age > ageMax)) continue;
    if (lifestyle.length && !lifestyle.some((x) => (row.lifestylePreferences ?? []).includes(x))) continue;
    if (interests.length && !interests.some((x) => (row.interests ?? []).includes(x))) continue;
    if (intents.length && !intents.some((x) => (row.relationshipGoals ?? []).includes(x))) continue;
    if (religions.length && !religions.includes(row.religion ?? "")) continue;
    if (marital.length && !marital.includes(row.maritalStatus ?? "")) continue;
    if (kids.length && !kids.includes(row.hasKids ?? "")) continue;
    if (drinking.length && !drinking.includes(row.drinking ?? "")) continue;
    if (smoking.length && !smoking.includes(row.smoking ?? "")) continue;
    if (languages.length && !languages.includes(row.language ?? "")) continue;

    const loc = locByUser.get(row.id);
    let distanceKm: number | null = null;
    if (haveOrigin && loc?.latitude != null && loc?.longitude != null) {
      distanceKm = Math.round(haversineKm(fromLat, fromLng, loc.latitude, loc.longitude));
      if (distanceKm > distance) continue;
    } else if (haveOrigin) {
      continue; // tight distance filter + unknown location → hide
    }

    const prompts = Array.isArray(row.promptAnswers)
      ? (row.promptAnswers as Array<{ prompt?: string; answer?: string }>)
      : [];
    const firstPrompt = prompts[0];
    const traits = [...(row.values ?? []), ...(row.interests ?? [])].slice(0, 3);

    out.push({
      id: row.id,
      name: row.displayName ?? row.firstName ?? "Member",
      age,
      gender: row.gender ?? "",
      city: row.city ?? "",
      occupation: row.occupation ?? "",
      headline: row.bio ?? "",
      promptQuestion: firstPrompt?.prompt ?? "A value I will not compromise on…",
      promptAnswer: firstPrompt?.answer ?? "",
      traits,
      values: row.values ?? [],
      interests: row.interests ?? [],
      lifestyle: row.lifestylePreferences ?? [],
      relationshipGoals: row.relationshipGoals ?? [],
      photo: photoByUser.get(row.id)?.storagePath ?? "",
      photos: photosByUser.get(row.id) ?? [],
      verified: row.isVerified,
      isOnline,
      vaccinationStatus: row.vaccinationStatus,
      distanceKm,
      likes: countByProfile.get(row.id) ?? 0,
      joinedAt: row.createdAt,
    });
  }

  return Response.json({ profiles: out });
}
