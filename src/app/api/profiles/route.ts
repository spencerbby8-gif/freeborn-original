import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, discoveryPreferences, matches, profilePhotos, userPrivateLocations, userPrivateSettings, userProfiles, userSwipes } from "@/db/schema";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { getMember } from "@/lib/app-auth";
import { ageFromBirthDate } from "@/lib/age";

export const dynamic = "force-dynamic";

/* ageFromBirthDate now lives in src/lib/age.ts — it was copy-pasted
   verbatim into this file and /api/profile/[id]. Duplicating the AGE
   function specifically is how an under-18 member survives a partial fix. */

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
  /* B6. This endpoint returns real members' names, ages, cities, occupations
     and photographs. Authentication used to be OPTIONAL here: the Bearer token
     was read only to personalise the deck, so an anonymous caller fell through
     to the same query and received live member data.

     Measured on the live preview deployment before this guard:
       GET /api/profiles   (no cookie, no Bearer)   -> 200
       {"profiles":[{"id":"772a1827-...","name":"Spencer","age":23,
        "gender":"man","city":"Abraka","occupation":"Business owner", ...}]}

     That made the member directory public and crawlable, which is exactly what
     Privacy Policy clause 5 promises it is not. For a dating service used by
     people who are publicly identifiable by their health views, an open
     directory of faces and cities is a safety failure, not a technicality. */
  const viewer = await getMember(request).catch(() => null);
  if (!viewer) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  /* Signed-in viewer: their own card must never appear in their own deck,
     blocked members never appear in either direction, and the viewer's own
     vaccination stance powers the values-affinity ranking. */
  let viewerId: string | null = viewer.id;
  let viewerVax = "prefer_not_to_say";
  let viewerVerified = false;
  let viewerValues: string[] = [];
  let viewerInterests: string[] = [];
  let viewerGoals: string[] = [];
  const hiddenIds = new Set<string>();
  /* The viewer is already resolved above, so the personalisation block runs
     unconditionally. It used to be gated on the presence of a Bearer header,
     which silently skipped blocks, swipes and preferences for any member
     authenticated by SSR cookie instead. */
  {
    if (viewerId) {
      const [viewerRow] = await db
        .select({
          vaccinationStatus: userProfiles.vaccinationStatus,
          isVerified: userProfiles.isVerified,
          values: userProfiles.values,
          interests: userProfiles.interests,
          relationshipGoals: userProfiles.relationshipGoals,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, viewerId))
        .limit(1);
      if (viewerRow) {
        viewerVax = viewerRow.vaccinationStatus;
        viewerValues = viewerRow.values ?? [];
        viewerInterests = viewerRow.interests ?? [];
        viewerGoals = viewerRow.relationshipGoals ?? [];
        viewerVerified = viewerRow.isVerified;
      }
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

  /* Standing preferences (Settings → Discovery) are the BASE filter for a
     signed-in viewer; the filter panel's query params refine a session on
     top. The settings screen has always displayed these values — the deck
     now honors them. No stored row → no base restriction (old behavior). */
  let baseAgeMin = NaN;
  let baseAgeMax = NaN;
  let baseGenders: string[] = [];
  let baseVerifiedOnly = false;
  let basePhotosRequired = true;
  let baseVax = "any";
  let baseDistance = NaN;
  if (viewerId) {
    const [prefs] = await db
      .select()
      .from(discoveryPreferences)
      .where(eq(discoveryPreferences.userId, viewerId))
      .limit(1);
    if (prefs) {
      baseAgeMin = prefs.ageMin;
      baseAgeMax = prefs.ageMax;
      baseGenders = prefs.showGenders ?? [];
      baseVerifiedOnly = prefs.verifiedOnly;
      basePhotosRequired = prefs.photosRequired;
      baseVax = prefs.vaccinationPreference ?? "any";
      baseDistance = prefs.distanceKm;
    }
  }

  const url = new URL(request.url);
  const vaxParam = url.searchParams.get("vax"); // any | vaccinated | unvaccinated
  const vax = vaxParam && vaxParam !== "any" ? vaxParam : baseVax;
  const verifiedOnly = url.searchParams.get("verified") === "1" ? true : baseVerifiedOnly;
  const onlineOnly = url.searchParams.get("online") === "1";
  const genderParam = list(url.searchParams.get("gender"));
  const genders = genderParam.length ? genderParam : baseGenders;
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
  const ageMin = ageMinParam !== null ? Number(ageMinParam) : baseAgeMin;
  const ageMax = ageMaxParam !== null ? Number(ageMaxParam) : baseAgeMax;
  const distanceParam = url.searchParams.get("distance");
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  // 500 means "Anywhere" — treat it (and anything above) as no cap at all.
  const distance =
    distanceParam !== null && Number(distanceParam) < 500
      ? Number(distanceParam)
      : Number.isFinite(baseDistance) && baseDistance < 500
        ? baseDistance
        : NaN;
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

  /* Privacy controls per candidate: snooze (discovery_paused), incognito,
     and the display flags the card should honor (hide distance / active). */
  const privRows = await db
    .select({
      userId: userPrivateSettings.userId,
      discoveryPaused: userPrivateSettings.discoveryPaused,
      incognito: userPrivateSettings.incognito,
      hideDistance: userPrivateSettings.hideDistance,
      hideActiveStatus: userPrivateSettings.hideActiveStatus,
    })
    .from(userPrivateSettings);
  const privByUser = new Map(privRows.map((r) => [r.userId, r]));

  /* Incognito members are visible only to members they liked or matched
     with (Bumble semantics) — everyone else never sees their card. */
  const admirerIds = new Set<string>();
  const mutualIds = new Set<string>();
  if (viewerId) {
    const admirerRows = await db
      .select({ likerId: userSwipes.likerId })
      .from(userSwipes)
      .where(and(eq(userSwipes.likedId, viewerId), eq(userSwipes.action, "like")));
    for (const r of admirerRows) admirerIds.add(r.likerId);
    const myMatches = await db
      .select({ userA: matches.userA, userB: matches.userB })
      .from(matches)
      .where(or(eq(matches.userA, viewerId), eq(matches.userB, viewerId)));
    for (const m of myMatches) {
      mutualIds.add(m.userA === viewerId ? m.userB : m.userA);
    }
  }

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
    // Photoless profiles stay out only while the viewer requires photos
    // (their standing preference); otherwise they render with a placeholder.
    if (!photoByUser.has(row.id) && basePhotosRequired) continue;
    // Their privacy choice: who is allowed to see them in discovery.
    const dp = (row as { discoverPrivacy?: string }).discoverPrivacy ?? "everyone";
    if (dp === "verified" && !viewerVerified) continue;
    if (dp === "unvaccinated" && viewerVax !== "unvaccinated") continue;

    // Their snooze choice: a paused member is out of the room (matches/chat unaffected).
    const priv = privByUser.get(row.id);
    if (priv?.discoveryPaused) continue;
    // Incognito: visible only to members they liked or matched with.
    if (priv?.incognito && !(viewerId && (admirerIds.has(row.id) || mutualIds.has(row.id)))) continue;

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
      hasPhoto: photoByUser.has(row.id),
      hideDistance: priv?.hideDistance ?? false,
      hideActiveStatus: priv?.hideActiveStatus ?? false,
      /* "In common" — honest shared-trait counts, never a compatibility %. */
      inCommon: {
        values: (row.values ?? []).filter((v) => viewerValues.includes(v)),
        interests: (row.interests ?? []).filter((i) => viewerInterests.includes(i)),
        goals: (row.relationshipGoals ?? []).filter((g) => viewerGoals.includes(g)),
      },
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
