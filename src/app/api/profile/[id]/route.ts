import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { getMember } from "@/lib/app-auth";
import {
  matches,
  messages,
  profilePhotos,
  userPrivateLocations,
  userPrivateSettings,
  userProfiles,
  userSwipes,
} from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ageFromBirthDate } from "@/lib/age";
import { badIdResponse, isUuid } from "@/lib/uuid";

/* ageFromBirthDate now lives in src/lib/age.ts — it was copy-pasted
   verbatim into this file and /api/profile/[id]. Duplicating the AGE
   function specifically is how an under-18 member survives a partial fix. */

/** Privacy-friendly date of birth: month + year (age is derived). */
function birthLabel(birthDate: string | null): string {
  if (!birthDate) return "";
  const d = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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

/**
 * Full profile: identity, story, values, photos, verification, vaccination
 * stance, and a real reply rate computed from conversation history.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return badIdResponse();
  const url = new URL(request.url);
  const fromLat = Number(url.searchParams.get("lat"));
  const fromLng = Number(url.searchParams.get("lng"));
  const haveOrigin = Number.isFinite(fromLat) && Number.isFinite(fromLng);

  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.id, id)).limit(1);
  if (!row) return Response.json({ error: "Profile not found." }, { status: 404 });

  const photos = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(profilePhotos.position);

  // Fallback: members onboarded through Supabase keep their photos there —
  // this keeps "view as others" complete with every picture intact.
  let photoUrls = photos.map((p) => resolvePhotoUrl(p.storagePath));
  if (photoUrls.length === 0) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: sbPhotos } = await supabase
        .from("profile_photos")
        .select("storage_path")
        .eq("user_id", id)
        .order("position", { ascending: true });
      photoUrls = (sbPhotos ?? []).map((p) => {
        const path = p.storage_path as string;
        if (/^https?:\/\//.test(path)) return path;
        return supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
      });
    } catch {
      /* local-only preview room */
    }
  }

  const [loc] = await db
    .select()
    .from(userPrivateLocations)
    .where(eq(userPrivateLocations.userId, id))
    .limit(1);

  // Reply rate — measured truthfully: of the conversations where this member
  // RECEIVED at least one message, the share they actually answered in that
  // same thread. No estimates, only real message history.
  const myMatchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(sql`${matches.userA} = ${id} or ${matches.userB} = ${id}`);
  const myMatchIds = new Set(myMatchRows.map((m) => m.id));

  const incomingThreads = await db
    .select({ matchId: messages.matchId })
    .from(messages)
    .where(sql`${messages.senderId} <> ${id}`)
    .groupBy(messages.matchId);
  const outgoingThreads = await db
    .select({ matchId: messages.matchId })
    .from(messages)
    .where(eq(messages.senderId, id))
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

  // Match rate: of the likes this person received, how many became matches.
  const [likesReceived] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, id), eq(userSwipes.action, "like")));
  const [matchCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matches)
    .where(sql`${matches.userA} = ${id} or ${matches.userB} = ${id}`);
  const likesIn = likesReceived?.count ?? 0;
  const matchesN = matchCount?.count ?? 0;
  const matchRate = likesIn > 0 ? Math.min(100, Math.round((matchesN / likesIn) * 100)) : null;

  const prompts = Array.isArray(row.promptAnswers)
    ? (row.promptAnswers as Array<{ prompt?: string; answer?: string }>)
    : [];

  /* The viewer's messaging rights under this member's privacy rules. */
  let messageRestricted: string | null = null;
  const mp = row.messagePrivacy ?? "everyone";
  if (mp !== "everyone") {
    const name = mp === "verified" ? "Only verified members can message" : "Only unvaccinated members can message";
    const viewer = await getMember(request).catch(() => null);
    if (!viewer) {
      messageRestricted = name;
    } else {
      const [me] = await db
        .select({
          isVerified: userProfiles.isVerified,
          vaccinationStatus: userProfiles.vaccinationStatus,
        })
        .from(userProfiles)
        .where(eq(userProfiles.id, viewer.id))
        .limit(1);
      const allowed =
        mp === "verified" ? me?.isVerified === true : me?.vaccinationStatus === "unvaccinated";
      if (!allowed) messageRestricted = name;
    }
  }

  /* Privacy display flags — the card honors the owner's choices: when they
     hide their distance, only the city is shown; the real distance is never
     sent to the client at all. */
  const [priv] = await db
    .select({
      hideDistance: userPrivateSettings.hideDistance,
      hideActiveStatus: userPrivateSettings.hideActiveStatus,
    })
    .from(userPrivateSettings)
    .where(eq(userPrivateSettings.userId, id))
    .limit(1);
  const hideDistance = priv?.hideDistance ?? false;
  const hideActiveStatus = priv?.hideActiveStatus ?? false;

  return Response.json({
    profile: {
      id: row.id,
      name: row.displayName ?? row.firstName ?? "Member",
      age: ageFromBirthDate(row.birthDate),
      city: row.city ?? "",
      region: row.region ?? "",
      occupation: row.occupation ?? "",
      education: row.education ?? "",
      educationLevel: row.educationLevel ?? "",
      bio: row.bio ?? "",
      language: row.language ?? "",
      religion: row.religion ?? "",
      maritalStatus: row.maritalStatus ?? "",
      hasKids: row.hasKids ?? "",
      wantsKids: row.wantsKids ?? "",
      drinking: row.drinking ?? "",
      smoking: row.smoking ?? "",
      heightCm: row.heightCmProfile,
      values: row.values ?? [],
      interests: row.interests ?? [],
      lifestyle: row.lifestylePreferences ?? [],
      relationshipGoals: row.relationshipGoals ?? [],
      prompts,
      photos: photoUrls,
      verified: row.isVerified,
      messageRestricted,
      vaccinationStatus: row.vaccinationStatus,
      replyRate,
      matchRate,
      likesReceived: likesIn,
      matchesCount: matchesN,
      conversationCount: receivedThreads.size,
      memberSince: row.createdAt,
      birthMonthYear: birthLabel(row.birthDate),
      distanceKm:
        !hideDistance && haveOrigin && loc?.latitude != null && loc?.longitude != null
          ? Math.round(haversineKm(fromLat, fromLng, loc.latitude, loc.longitude))
          : null,
      hideActiveStatus,
    },
  });
}
