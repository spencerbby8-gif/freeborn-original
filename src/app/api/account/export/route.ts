import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  blockedUsers,
  discoveryPreferences,
  matches,
  messages,
  notificationPreferences,
  profilePhotos,
  reports,
  userPrivateSettings,
  userProfiles,
  userSwipes,
  verificationRequests,
} from "@/db/schema";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/export — "Download my data" (GDPR/CCPA-style export).
 * Scope, honestly: everything that is YOUR data. Other members appear only
 * as ids/timestamps — never their private details. Selfie images from
 * verification are NOT exported (they are verification evidence, not profile
 * data); deleting the account removes them.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });
  const id = user.id;

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.id, id)).limit(1);
  const [prefs] = await db.select().from(discoveryPreferences).where(eq(discoveryPreferences.userId, id)).limit(1);
  const [notifs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, id)).limit(1);
  const [priv] = await db.select().from(userPrivateSettings).where(eq(userPrivateSettings.userId, id)).limit(1);
  const photos = await db
    .select({ storagePath: profilePhotos.storagePath, position: profilePhotos.position, isPrimary: profilePhotos.isPrimary, createdAt: profilePhotos.createdAt })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(profilePhotos.position);
  const swipes = await db
    .select({ likedId: userSwipes.likedId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(eq(userSwipes.likerId, id));
  const myMatches = await db
    .select({ id: matches.id, userA: matches.userA, userB: matches.userB, createdAt: matches.createdAt })
    .from(matches)
    .where(or(eq(matches.userA, id), eq(matches.userB, id)));
  const myMessages = await db
    .select({ id: messages.id, matchId: messages.matchId, body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt })
    .from(messages)
    .where(eq(messages.senderId, id));
  const myBlocks = await db
    .select({ blockedId: blockedUsers.blockedId, createdAt: blockedUsers.createdAt })
    .from(blockedUsers)
    .where(eq(blockedUsers.blockerId, id));
  const myVerifications = await db
    .select({ status: verificationRequests.status, method: verificationRequests.method, submittedAt: verificationRequests.submittedAt, reviewedAt: verificationRequests.reviewedAt })
    .from(verificationRequests)
    .where(eq(verificationRequests.accountId, id));
  const myReports = await db
    .select({ reason: reports.reason, status: reports.status, createdAt: reports.createdAt })
    .from(reports)
    .where(eq(reports.reporterId, id));
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "freeborn-data-export/1",
    account: {
      email: user.email,
      createdAt: account?.createdAt ?? null,
      authProviders: profile?.authProviders ?? [],
    },
    profile: profile
      ? {
          displayName: profile.displayName,
          firstName: profile.firstName,
          birthDate: profile.birthDate,
          gender: profile.gender,
          city: profile.city,
          region: profile.region,
          countryCode: profile.countryCode,
          bio: profile.bio,
          occupation: profile.occupation,
          education: profile.education,
          educationLevel: profile.educationLevel,
          language: profile.language,
          religion: profile.religion,
          maritalStatus: profile.maritalStatus,
          hasKids: profile.hasKids,
          wantsKids: profile.wantsKids,
          drinking: profile.drinking,
          smoking: profile.smoking,
          heightCm: profile.heightCmProfile,
          vaccinationStatus: profile.vaccinationStatus,
          values: profile.values,
          interests: profile.interests,
          lifestylePreferences: profile.lifestylePreferences,
          relationshipGoals: profile.relationshipGoals,
          promptAnswers: profile.promptAnswers,
          isVerified: profile.isVerified,
          messagePrivacy: profile.messagePrivacy,
          discoverPrivacy: profile.discoverPrivacy,
          discoverable: profile.discoverable,
          profileStatus: profile.profileStatus,
          memberSince: profile.createdAt,
        }
      : null,
    photos: photos.map((p) => ({ position: p.position, isPrimary: p.isPrimary, storagePath: p.storagePath, addedAt: p.createdAt })),
    preferences: {
      discovery: prefs ?? null,
      notifications: notifs ?? null,
      privacyControls: priv
        ? {
            discoveryPaused: priv.discoveryPaused,
            incognito: priv.incognito,
            hideDistance: priv.hideDistance,
            hideActiveStatus: priv.hideActiveStatus,
            readReceipts: priv.readReceipts,
          }
        : null,
    },
    activity: {
      swipesGiven: swipes,
      matches: myMatches.map((m) => ({ matchId: m.id, with: m.userA === id ? m.userB : m.userA, since: m.createdAt })),
      messagesSent: myMessages,
      blockedMembers: myBlocks,
    },
    verification: {
      requests: myVerifications,
      note: "Selfie images from identity verification are verification evidence and are not part of this export. Deleting your account removes them.",
    },
    reportsFiled: myReports,
    note: "Other members appear only as ids and timestamps. Your photos are downloadable from your profile page; this export lists their storage paths.",
  };

  const body = JSON.stringify(payload, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="freeborn-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

