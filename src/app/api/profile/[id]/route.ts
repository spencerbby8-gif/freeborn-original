import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { getMember } from "@/lib/app-auth";
import {
  blockedUsers,
  eventInterests,
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

  /* B6. This route answered anonymous requests and applied none of the owner's
     privacy controls: a caller who guessed or harvested a member id could read
     the full profile of someone who was hidden, snoozed, incognito, or who had
     blocked them. Authentication is now required, and the owner's settings are
     enforced below. */
  const viewer = await getMember(request).catch(() => null);
  if (!viewer) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  /* 404 rather than 403 for every refusal: a 403 confirms the id exists, which
     turns this endpoint into an oracle for enumerating members. */
  const notReadable = () => Response.json({ error: "Profile not found." }, { status: 404 });

  const url = new URL(request.url);
  const fromLat = Number(url.searchParams.get("lat"));
  const fromLng = Number(url.searchParams.get("lng"));
  const haveOrigin = Number.isFinite(fromLat) && Number.isFinite(fromLng);

  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.id, id)).limit(1);
  if (!row) return Response.json({ error: "Profile not found." }, { status: 404 });

  /* Only set when the caller asked with ?as=others, and only ever about the
     caller's own profile. */
  let visibility: { visible: boolean; reasons: string[] } | null = null;

  /* A member may always read themselves. Everyone else is subject to the same
     visibility rules the deck applies. */
  if (row.id !== viewer.id) {
    const isVisible =
      row.profileStatus === "active" &&
      row.discoverable === true &&
      row.onboardingStage === "ready";
    if (!isVisible) return notReadable();

    const [ownerPriv] = await db
      .select({
        incognito: userPrivateSettings.incognito,
        discoveryPaused: userPrivateSettings.discoveryPaused,
      })
      .from(userPrivateSettings)
      .where(eq(userPrivateSettings.userId, id))
      .limit(1);

    // Snooze removes the member from discovery entirely.
    if (ownerPriv?.discoveryPaused) return notReadable();

    /* Incognito keeps the same semantics as the deck: visible only to members
       the owner liked, or has matched with. */
    if (ownerPriv?.incognito) {
      const [likedViewer] = await db
        .select({ likedId: userSwipes.likedId })
        .from(userSwipes)
        .where(
          and(
            eq(userSwipes.likerId, id),
            eq(userSwipes.likedId, viewer.id),
            eq(userSwipes.action, "like")
          )
        )
        .limit(1);
      const [mutual] = await db
        .select({ id: matches.id })
        .from(matches)
        .where(
          or(
            and(eq(matches.userA, id), eq(matches.userB, viewer.id)),
            and(eq(matches.userA, viewer.id), eq(matches.userB, id))
          )
        )
        .limit(1);
      if (!likedViewer && !mutual) return notReadable();
    }

    // A block hides both members from each other, in either direction.
    const [block] = await db
      .select({ id: blockedUsers.id })
      .from(blockedUsers)
      .where(
        or(
          and(eq(blockedUsers.blockerId, viewer.id), eq(blockedUsers.blockedId, id)),
          and(eq(blockedUsers.blockerId, id), eq(blockedUsers.blockedId, viewer.id))
        )
      )
      .limit(1);
    if (block) return notReadable();
  } else if (url.searchParams.get("as") === "others") {
    /* "View as others" is a promise, and the branch above lets a self-read skip
       every one of those rules. So the button used to show a member their own
       profile exactly as they see it and label it what strangers see: a member
       who was incognito, or had discovery paused, or had not finished
       onboarding, would read a full card as "the room can see me" when the room
       could not. Answer the question actually being asked instead.

       This is not a complete impersonation. Blocks and the hypothetical viewer's
       own filters are not simulated, and the UI says so rather than claiming
       more than was computed. */
    const [ownPriv] = await db
      .select({
        incognito: userPrivateSettings.incognito,
        discoveryPaused: userPrivateSettings.discoveryPaused,
      })
      .from(userPrivateSettings)
      .where(eq(userPrivateSettings.userId, id))
      .limit(1);

    const reasons: string[] = [];
    if (row.profileStatus !== "active") reasons.push("Your profile is not active.");
    if (row.discoverable !== true) reasons.push("Discovery is switched off in Settings.");
    if (row.onboardingStage !== "ready") reasons.push("Your onboarding is not finished yet.");
    if (ownPriv?.discoveryPaused) reasons.push("Discovery is paused, so you are out of the room.");
    if (ownPriv?.incognito) {
      reasons.push("Incognito is on, so only members you liked or matched with can find you.");
    }

    visibility = { visible: reasons.length === 0, reasons };
  }

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

  /* The viewer's messaging rights under this member's privacy rules.
     `viewer` is already resolved above and cannot be null here, because the
     route returns 401 when there is no signed-in member. The "no viewer"
     branch that used to live here was therefore unreachable, and removing it
     also removes a second, redundant authentication round-trip to Supabase. */
  let messageRestricted: string | null = null;
  const mp = row.messagePrivacy ?? "everyone";
  if (mp !== "everyone") {
    const name = mp === "verified" ? "Only verified members can message" : "Only unvaccinated members can message";
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

  /* Truthful presence. POST /api/heartbeat writes lastActiveAt and is throttled
     to one real write per member per 2 minutes, so a 15-minute "now" window is
     honest rather than optimistic. The deck labels a 24-hour window "Online",
     which is not what that word means; this route does not repeat that. A member
     who hides their active status gets no presence at all, and neither does
     anyone reading them. */
  const presence = (() => {
    /* "hidden" is returned as its own value rather than collapsed into null: a
       member who chose to hide their presence should read as having made a
       choice, not as having been away for a week. */
    if (hideActiveStatus) return "hidden";
    if (!row.lastActiveAt) return null;
    const idle = Date.now() - row.lastActiveAt.getTime();
    if (idle < 15 * 60 * 1000) return "now";
    if (idle < 24 * 60 * 60 * 1000) return "today";
    if (idle < 7 * 24 * 60 * 60 * 1000) return "week";
    return null;
  })();

  /* Open to meeting in person. eventInterests holds at most one city per member,
     written when they ask for a mixer there, so this is a stated intention and
     not an inference. */
  const [mixer] = await db
    .select({ city: eventInterests.city })
    .from(eventInterests)
    .where(eq(eventInterests.userId, id))
    .limit(1);

  /* Shared ground, computed here rather than in the browser so the viewer's own
     values, interests and lifestyle never travel to the client. Only for someone
     else's profile: being told what you have in common with yourself is noise.
     Sent as words, not counts, because "3 in common" says nothing to read. */
  let inCommon: { values: string[]; interests: string[]; lifestyle: string[] } | null = null;
  if (row.id !== viewer.id) {
    const [mine] = await db
      .select({
        values: userProfiles.values,
        interests: userProfiles.interests,
        lifestyle: userProfiles.lifestylePreferences,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, viewer.id))
      .limit(1);
    const overlap = (theirs: unknown, mineValue: unknown) => {
      const left = Array.isArray(theirs) ? (theirs as string[]) : [];
      const right = new Set(Array.isArray(mineValue) ? (mineValue as string[]) : []);
      return left.filter((x) => right.has(x));
    };
    inCommon = {
      values: overlap(row.values, mine?.values),
      interests: overlap(row.interests, mine?.interests),
      lifestyle: overlap(row.lifestylePreferences, mine?.lifestyle),
    };
  }

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
      gender: row.gender ?? "",
      dealBreakers: Array.isArray(row.dealBreakers) ? row.dealBreakers : [],
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
      presence,
      mixerCity: mixer?.city ?? null,
      inCommon,
      visibility,
    },
  });
}
