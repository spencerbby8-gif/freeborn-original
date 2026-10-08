import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, profilePhotos, userPrivateLocations, userProfiles, userSwipes } from "@/db/schema";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { getMember } from "@/lib/app-auth";

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
  /* Signed-in viewer: their own card must never appear in their own deck,
     blocked members never appear in either direction, and the viewer's own
     vaccination stance powers the values-affinity ranking. */
  let viewerId: string | null = null;
  let viewerVax = "prefer_not_to_say";
  const hiddenIds = new Set<string>();
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    const member = await getMember(request).catch(() => null);
    viewerId = member?.id ?? null;
    if (viewerId) {
      const [viewerRow] = await db
        .select({ vaccinationStatus: userProfiles.vaccinationStatus })
        .from(userProfiles)
        .where(eq(userProfiles.id, viewerId))
        .limit(1);
      if (viewerRow) viewerVax = viewerRow.vaccinationStatus;
      const blocks = await db
        .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
        .from(blockedUsers)
        .where(or(eq(blockedUsers.blockerId, viewerId), eq(blockedUsers.blockedId, viewerId)));
      for (const b of blocks) {
        hiddenIds.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
      }

      /* No silent recycling: every profile this member already swiped
         (pass, like, or superlike) stays out of the deck. Liked members
         live in the Likes tab; passed members return only if the member
         deliberately resets them. */
      const swiped = await db
        .select({ likedId: userSwipes.likedId })
        .from(userSwipes)
        .where(eq(userSwipes.likerId, viewerId));
      for (const s of swiped) hiddenIds.add(s.likedId);
    }
  }

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
    .where(
      sql`${userProfiles.profileStatus} = 'active'
        and ${userProfiles.discoverable} = true
        and ${userProfiles.onboardingStage} = 'ready'
        and ${userProfiles.handle} is distinct from 'preview_visitor'`
    );

  /* (Feed ordering moved below — the ranking engine runs after the photo and
     location maps exist so it can score with complete facts.) */

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

  /* =========================================================================
     FREEBORN RANKING ENGINE
     Hard filters above are absolute truth — whatever a member filters for is
     exactly what they get. Below that, visibility is earned, gently:
       1. Values affinity  — unvaccinated members see unvaccinated people
                             first (a boost, never a forced exclusion unless
                             their own filter demands one).
       2. Completeness     — finished profiles rise, capped so new members
                             still get real exposure.
       3. Recency          — active members surface first.
       4. Freshness        — brand-new members get discovered.
       5. Diversity jitter — the deck never hardens into one fixed order.
     ========================================================================= */

  const DAY = 24 * 60 * 60 * 1000;
  const rankNow = Date.now();

  const completenessOf = (r: (typeof rows)[number]): number => {
    let filled = 0;
    const total = 12;
    if (r.displayName) filled++;
    if (r.birthDate) filled++;
    if (r.city) filled++;
    if (r.bio) filled++;
    if (r.occupation) filled++;
    if (r.language) filled++;
    if (r.religion) filled++;
    if (r.maritalStatus) filled++;
    if (r.hasKids) filled++;
    if (r.wantsKids) filled++;
    if (r.drinking) filled++;
    if (r.smoking) filled++;
    let bonus = 0;
    if ((r.values ?? []).length > 0) bonus += 2;
    if ((r.interests ?? []).length > 0) bonus += 2;
    if (Array.isArray(r.promptAnswers) && r.promptAnswers.length > 0) bonus += 2;
    return Math.min(1, (filled + bonus) / (total + 6));
  };

  const scoreOf = (r: (typeof rows)[number]): number => {
    let score = 0;

    // 1) Values affinity.
    if (viewerVax === "unvaccinated") {
      score += r.vaccinationStatus === "unvaccinated" ? 50 : r.vaccinationStatus === "prefer_not_to_say" ? 25 : 0;
    } else if (viewerVax === "vaccinated") {
      score += r.vaccinationStatus === "vaccinated" ? 20 : r.vaccinationStatus === "prefer_not_to_say" ? 10 : 0;
    } else {
      score += r.vaccinationStatus === viewerVax ? 10 : 5;
    }

    // 2) Completeness — a gentle, capped lift (max +18).
    score += completenessOf(r) * 18;

    // 3) Recency.
    const activeAt = r.lastActiveAt ? r.lastActiveAt.getTime() : 0;
    const idle = rankNow - activeAt;
    if (idle < DAY) score += 15;
    else if (idle < 3 * DAY) score += 9;
    else if (idle < 7 * DAY) score += 4;

    // 4) Freshness.
    const memberAge = rankNow - r.createdAt.getTime();
    if (memberAge < 14 * DAY) score += 12;
    else if (memberAge < 30 * DAY) score += 6;

    // 5) Diversity jitter.
    score += Math.random() * 4;

    return score;
  };

  rows.sort((a, b) => scoreOf(b) - scoreOf(a));

  const nowMs = Date.now();
  const out = [];
  for (const row of rows) {
    // Never show members their own card.
    if (viewerId && row.id === viewerId) continue;
    // Blocked in either direction — gone from both decks.
    if (hiddenIds.has(row.id)) continue;
    // A card without a photo renders blank — photoless profiles stay out.
    if (!photoByUser.has(row.id)) continue;

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
      photo: resolvePhotoUrl(photoByUser.get(row.id)?.storagePath ?? ""),
      photos: (photosByUser.get(row.id) ?? []).map(resolvePhotoUrl),
      verified: row.isVerified,
      isOnline,
      vaccinationStatus: row.vaccinationStatus,
      distanceKm,
      likes: countByProfile.get(row.id) ?? 0,
      joinedAt: row.createdAt,
      isNew: nowMs - row.createdAt.getTime() < 14 * 24 * 60 * 60 * 1000,
    });
  }

  return Response.json({ profiles: out });
}
