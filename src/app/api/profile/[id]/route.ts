import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  matches,
  messages,
  profilePhotos,
  userPrivateLocations,
  userProfiles,
  userSwipes,
} from "@/db/schema";

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

/**
 * Full profile: identity, story, values, photos, verification, vaccination
 * stance, and a real reply rate computed from conversation history.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.id, id)).limit(1);
  if (!row) return Response.json({ error: "Profile not found." }, { status: 404 });

  const photos = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(profilePhotos.position);

  const [loc] = await db
    .select()
    .from(userPrivateLocations)
    .where(eq(userPrivateLocations.userId, id))
    .limit(1);

  // Reply rate: of the messages this person received, how many did they answer?
  const incoming = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(sql`${messages.senderId} <> ${id} and ${messages.matchId} in (
      select m.id from matches m where m.user_a = ${id} or m.user_b = ${id}
    )`);
  const outgoing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.senderId, id), sql`1=1`));

  const received = incoming[0]?.count ?? 0;
  const sent = outgoing[0]?.count ?? 0;
  const replyRate = received > 0 ? Math.min(100, Math.round((sent / received) * 100)) : null;

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
      photos: photos.map((p) => p.storagePath),
      verified: row.isVerified,
      vaccinationStatus: row.vaccinationStatus,
      replyRate,
      matchRate,
      likesReceived: likesIn,
      matchesCount: matchesN,
      conversationCount: received,
      memberSince: row.createdAt,
    },
  });
}
