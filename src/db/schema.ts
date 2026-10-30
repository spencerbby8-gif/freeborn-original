/* ==========================================================================
   FREEBORN — LOCAL SCHEMA
   Mirrors supabase/migrations exactly (all 11 migration files), with
   `accounts` standing in for Supabase's managed auth.users.
   ========================================================================== */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

const char2 = customType<{ data: string }>({
  dataType() {
    return "character(2)";
  },
});

/** Fixed-width hex/binary digests (sha256 hex = 64). Length is enforced by the
    column type rather than a check constraint, so a truncated write cannot land. */
const charN = (name: string, len: number) =>
  customType<{ data: string }>({ dataType() { return `character(${len})`; } })(name);

/** A 64-bit hash stored as `char(16)` LOWERCASE HEX — the exact encoding
 *  src/lib/photo-hash.ts emits (`toString("hex")`).
 *
 *  This type is named `bit64` for historical reasons and MUST NOT be `bit(64)`:
 *  node-postgres returns bit columns as "0100…" strings and accepts only that form
 *  on write, so declaring bit(64) while passing hex made every hashed-photo insert
 *  fail with 22P02 `"d" is not a valid binary digit`. The live schema, this type and
 *  the hex producer are now locked together by an assertion in scripts/trust/harness.ts
 *  that reads information_schema. Do not "optimise" this to bit or bytea without
 *  changing photo-hash.ts, hamming64() and that assertion in the same commit.
 *  Postgres can still popcount: public.hamming64(text, text) casts internally. */
const bit64 = customType<{ data: string }>({
  dataType() {
    return "char(16)";
  },
});

const utcNow = sql`timezone('utc', now())`;
const emptyTextArray = sql`'{}'::text[]`;

/* --- Local stand-in for Supabase auth.users ----------------------------- */

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  /** scrypt credential, format "salt:hash" — mirrors Supabase auth.users.encrypted_password */
  encryptedPassword: text("encrypted_password"),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
  rawAppMetaData: jsonb("raw_app_meta_data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- public.user_profiles (phases 0 + 1 + 2 + 3 + later) ---------------- */

export const userProfiles = pgTable(
  "user_profiles",
  {
    /* ⚠ SCHEMA DRIFT — read before running any drizzle-kit migration.
       This declares a FK to `accounts`, but the LIVE database
       (ihwtpwlszegrjgakqsxx) has:
           user_profiles_id_fkey -> auth.users
       not -> accounts. `accounts` is a lazily-populated local mirror that
       src/lib/app-auth.ts inserts into on each authenticated request, so it
       only holds members who have actually hit an API route (3 rows vs 8
       auth.users / 8 profiles at audit time).

       Consequence: `drizzle-kit push` or a generated migration will try to
       create a second, conflicting FK to `accounts` and FAIL on every profile
       with no accounts mirror row — or, if forced with cascade semantics,
       delete real member data. Do not run drizzle-kit against production until
       this is reconciled. Either point the declaration at auth.users, or
       backfill `accounts` for all 8 auth.users and migrate the FK deliberately.

       Everything else in this file matched the live schema at audit time
       (35 FKs, 29 tables, RLS on 29/29). */
    id: uuid("id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: citext("email").notNull().unique(),
    handle: text("handle").unique(),
    onboardingStage: text("onboarding_stage").notNull().default("account_created"),
    profileStatus: text("profile_status").notNull().default("draft"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    birthDate: date("birth_date", { mode: "string" }),
    city: text("city"),
    region: text("region"),
    countryCode: char2("country_code"),
    relationshipGoal: text("relationship_goal"),
    values: text("values").array().notNull().default([]),
    bio: text("bio"),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    authProviders: text("auth_providers").array().notNull().default([]),
    displayName: text("display_name"),
    gender: text("gender"),
    interests: text("interests").array().notNull().default([]),
    lifestylePreferences: text("lifestyle_preferences").array().notNull().default([]),
    dealBreakers: text("deal_breakers").array().notNull().default([]),
    occupation: text("occupation"),
    education: text("education"),
    onboardingStep: text("onboarding_step").notNull().default("welcome"),
    relationshipGoals: text("relationship_goals").array().notNull().default([]),
    heightCm: integer("height_cm"),
    promptAnswers: jsonb("prompt_answers").notNull().default([]),
    showGender: text("show_gender").array().notNull().default([]),
    ageMinPreference: integer("age_min_preference").notNull().default(22),
    ageMaxPreference: integer("age_max_preference").notNull().default(45),
    maxDistanceKm: integer("max_distance_km").notNull().default(80),
    discoverable: boolean("discoverable").notNull().default(true),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().default(utcNow),
    photoCount: integer("photo_count").notNull().default(0),
    verifiedPhoto: boolean("verified_photo").notNull().default(false),
    hapticFeedback: boolean("haptic_feedback").notNull().default(true),
    cardAnimations: boolean("card_animations").notNull().default(true),
    notificationSounds: boolean("notification_sounds").notNull().default(true),
    vaccinationStatus: text("vaccination_status").notNull().default("prefer_not_to_say"),
    /* Expanded dating profile details */
    language: text("language"),
    religion: text("religion"),
    maritalStatus: text("marital_status"),
    hasKids: text("has_kids"),
    wantsKids: text("wants_kids"),
    drinking: text("drinking"),
    smoking: text("smoking"),
    educationLevel: text("education_level"),
    heightCmProfile: integer("height_cm_profile"),
    identityConsistencyStatus: text("identity_consistency_status").notNull().default("ready"),
    lastConsistencyCheckedAt: timestamp("last_consistency_checked_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastReverifiedAt: timestamp("last_reverified_at", { withTimezone: true }),
    periodicReverificationDueAt: timestamp("periodic_reverification_due_at", {
      withTimezone: true,
    }),
    /* Privacy controls — who can message me / who can see me in discovery.
       Values: everyone | verified | unvaccinated */
    messagePrivacy: text("message_privacy").notNull().default("everyone"),
    discoverPrivacy: text("discover_privacy").notNull().default("everyone"),
  },
  (t) => [
    check(
      "user_profiles_handle_format",
      sql`${t.handle} is null or ${t.handle} ~ '^[a-z0-9_]{3,24}$'`
    ),
    check(
      "user_profiles_profile_status_check",
      sql`${t.profileStatus} in ('draft', 'active', 'paused', 'hidden')`
    ),
    check(
      "user_profiles_gender_check",
      sql`${t.gender} is null or ${t.gender} in ('woman','man','non_binary','genderqueer','genderfluid','agender','two_spirit','prefer_to_self_describe','prefer_not_to_say')`
    ),
    check(
      "user_profiles_onboarding_step_check",
      sql`${t.onboardingStep} in ('welcome','identity','location','intent','relationship_intent','lifestyle','values','interests','bio','photos','discovery_preferences','verification','finish','about_you','bio_goals','interests_lifestyle','preferences_extras','complete')`
    ),
    check(
      "user_profiles_display_name_length",
      sql`${t.displayName} is null or length(${t.displayName}) between 2 and 40`
    ),
    check(
      "user_profiles_height_check",
      sql`${t.heightCm} is null or (${t.heightCm} between 120 and 230)`
    ),
    check(
      "user_profiles_age_preference_check",
      sql`${t.ageMinPreference} >= 18 and ${t.ageMaxPreference} >= ${t.ageMinPreference} and ${t.ageMaxPreference} <= 99`
    ),
    check(
      "user_profiles_distance_check",
      sql`${t.maxDistanceKm} between 5 and 500`
    ),
  ]
);

/* --- public.user_private_settings --------------------------------------- */

export const userPrivateSettings = pgTable("user_private_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  discoveryPaused: boolean("discovery_paused").notNull().default(false),
  /** Incognito mode: only members the owner liked / matched with can see them. */
  incognito: boolean("incognito").notNull().default(false),
  /** Hide exact distance from others; city is still shown. */
  hideDistance: boolean("hide_distance").notNull().default(false),
  /** Hide the online/active presence indicator from others. */
  hideActiveStatus: boolean("hide_active_status").notNull().default(false),
  /** When false, senders do not see that this member read their messages. */
  readReceipts: boolean("read_receipts").notNull().default(true),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- public.notification_preferences ------------------------------------ */

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  matchAlerts: boolean("match_alerts").notNull().default(true),
  messageAlerts: boolean("message_alerts").notNull().default(true),
  likeAlerts: boolean("like_alerts").notNull().default(true),
  profileActivity: boolean("profile_activity").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- public.user_private_locations -------------------------------------- */

export const userPrivateLocations = pgTable(
  "user_private_locations",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    accuracyM: doublePrecision("accuracy_m"),
    source: text("source").notNull().default("manual"),
    city: text("city"),
    region: text("region"),
    countryCode: char2("country_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check(
      "user_private_locations_latitude_check",
      sql`${t.latitude} is null or ${t.latitude} between -90 and 90`
    ),
    check(
      "user_private_locations_longitude_check",
      sql`${t.longitude} is null or ${t.longitude} between -180 and 180`
    ),
    check(
      "user_private_locations_accuracy_check",
      sql`${t.accuracyM} is null or ${t.accuracyM} between 0 and 100000`
    ),
    check("user_private_locations_source_check", sql`${t.source} in ('manual', 'gps')`),
  ]
);

/* --- public.discovery_preferences ---------------------------------------- */

export const discoveryPreferences = pgTable(
  "discovery_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    ageMin: integer("age_min").notNull().default(22),
    ageMax: integer("age_max").notNull().default(45),
    distanceKm: integer("distance_km").notNull().default(80),
    showGenders: text("show_genders")
      .array()
      .notNull()
      .default(["woman", "man", "non_binary"]),
    relationshipIntents: text("relationship_intents")
      .array()
      .notNull()
      .default(["long_term", "meaningful_connection", "life_partner"]),
    dealBreakerStrict: boolean("deal_breaker_strict").notNull().default(true),
    verifiedOnly: boolean("verified_only").notNull().default(false),
    photosRequired: boolean("photos_required").notNull().default(true),
    vaccinationPreference: text("vaccination_preference").notNull().default("any"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check(
      "discovery_preferences_age_check",
      sql`${t.ageMin} >= 18 and ${t.ageMax} >= ${t.ageMin} and ${t.ageMax} <= 99`
    ),
    check("discovery_preferences_distance_check", sql`${t.distanceKm} between 5 and 500`),
  ]
);

/* --- public.profile_photos ------------------------------------------------ */

export const profilePhotos = pgTable(
  "profile_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    blurhash: text("blurhash"),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false),
    /* Perceptual hashes of the bytes in chat_media, computed server-side at upload
       (src/lib/photo-hash.ts), stored as 16 hex chars. The JS hamming64() in that module
       does the comparison (the route needs the distance for its own thresholding, not just
       a boolean), and public.hamming64(text,text) exists so SQL-side audits and the parity
       script agree with it. null = "not hashed", which is NEVER read as "no duplicate". */
    phashD: bit64("phash_d"),
    phashA: bit64("phash_a"),
    /** sha256 of the exact uploaded bytes (64 hex chars). A global perceptual hash diverges
     *  past a ~5% crop — measured, not assumed — so this is what still links a
     *  byte-identical re-upload of the same file across two accounts. */
    phashBytes: charN("phash_bytes", 64),
    phashAt: timestamp("phash_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check("profile_photos_position_check", sql`${t.position} between 0 and 8`),
    index("profile_photos_user_position_idx").on(t.userId, t.position),
  ]
);

/* --- public.user_swipes ---------------------------------------------------- */

export const userSwipes = pgTable(
  "user_swipes",
  {
    likerId: uuid("liker_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    likedId: uuid("liked_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    primaryKey({ columns: [t.likerId, t.likedId], name: "user_swipes_pkey" }),
    check("user_swipes_no_self", sql`${t.likerId} <> ${t.likedId}`),
    check("user_swipes_action_check", sql`${t.action} in ('like', 'pass', 'superlike')`),
    index("user_swipes_liker_idx").on(t.likerId, t.createdAt),
    index("user_swipes_liked_idx").on(t.likedId, t.createdAt),
    index("user_swipes_action_idx").on(t.action),
  ]
);

/* --- public.user_matches ---------------------------------------------------- */

export const userMatches = pgTable(
  "user_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userA: uuid("user_a")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    userB: uuid("user_b")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    initiatedBy: uuid("initiated_by").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    unique("user_matches_pair_unique").on(t.userA, t.userB),
    check("user_matches_no_self", sql`${t.userA} <> ${t.userB}`),
    check("user_matches_ordered", sql`${t.userA} < ${t.userB}`),
    check("user_matches_status_check", sql`${t.status} in ('active','archived','blocked')`),
  ]
);

/* --- public.match_messages ---------------------------------------------------- */

export const matchMessages = pgTable(
  "match_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => userMatches.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [check("match_messages_body_length", sql`char_length(${t.body}) between 1 and 2000`)]
);

/* --- public.blocked_users ---------------------------------------------------- */

export const blockedUsers = pgTable(
  "blocked_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    unique("blocked_users_pair_unique").on(t.blockerId, t.blockedId),
    check("blocked_users_no_self", sql`${t.blockerId} <> ${t.blockedId}`),
  ]
);

/* --- public.verification_selfie_checks --------------------------------------- */

export const verificationSelfieChecks = pgTable(
  "verification_selfie_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    poseId: text("pose_id").notNull(),
    poseAssetPath: text("pose_asset_path").notNull(),
    status: text("status").notNull().default("pending"),
    score: numeric("score"),
    geminiResult: jsonb("gemini_result").notNull().default({}),
    feedback: text("feedback").array().notNull().default(emptyTextArray),
    challengeToken: text("challenge_token"),
    riskScore: numeric("risk_score"),
    identityConsistencyResult: jsonb("identity_consistency_result").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check(
      "verification_selfie_checks_status_check",
      sql`${t.status} in ('pending','approved','failed','error')`
    ),
    index("verification_selfie_checks_user_created_idx").on(t.userId, t.createdAt),
  ]
);

/* --- public.verification_challenges ------------------------------------------- */

export const verificationChallenges = pgTable("verification_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  poseId: text("pose_id").notNull(),
  gesture: text("gesture").notNull(),
  headDirection: text("head_direction").notNull(),
  expressionCue: text("expression_cue").notNull(),
  /* TEXT in the live database (verified via information_schema), holding the id of the
     `human_challenges` row this pose is bound to, with its own UNIQUE constraint — that
     uniqueness is what makes a pose spendable exactly once. Do not "tidy" this to uuid:
     the comparison in pose-challenge.ts is text-to-text and a uuid column would make it
     throw 42883. */
  challengeToken: text("challenge_token").notNull().unique(),
  challengePayload: jsonb("challenge_payload").notNull().default({}),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`timezone('utc', now()) + interval '15 minutes'`),
});

/* --- public.verification_rate_limits ------------------------------------------- */

export const verificationRateLimits = pgTable("verification_rate_limits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  failedAttemptsWindow: integer("failed_attempts_window").notNull().default(0),
  totalFailedAttempts: integer("total_failed_attempts").notNull().default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().default(utcNow),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- public.verification_audit_logs --------------------------------------------- */

export const verificationAuditLogs = pgTable("verification_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id"),
  challengeId: text("challenge_id"),
  challengeAssigned: jsonb("challenge_assigned").notNull().default({}),
  geminiAnalysis: jsonb("gemini_analysis").notNull().default({}),
  backendDecision: text("backend_decision").notNull(),
  internalRiskScore: numeric("internal_risk_score").notNull().default("0"),
  failureReasons: text("failure_reasons").array().notNull().default(emptyTextArray),
  retryCount: integer("retry_count").notNull().default(0),
  inCooldown: boolean("in_cooldown").notNull().default(false),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  eventType: text("event_type").notNull().default("SELFIE_VERIFICATION"),
  comparedPhotos: text("compared_photos").array().notNull().default(emptyTextArray),
  consistencyConfidence: numeric("consistency_confidence").notNull().default("0"),
  reverifyRequired: boolean("reverify_required").notNull().default(false),
  trustScore: numeric("trust_score").notNull().default("50"),
  duplicateRisk: boolean("duplicate_risk").notNull().default(false),
});

/* --- public.user_trust_history ---------------------------------------------------- */

export const userTrustHistory = pgTable("user_trust_history", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  verificationAttempts: integer("verification_attempts").notNull().default(0),
  verificationSuccesses: integer("verification_successes").notNull().default(0),
  verificationFailures: integer("verification_failures").notNull().default(0),
  mismatchHistoryCount: integer("mismatch_history_count").notNull().default(0),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastReverifiedAt: timestamp("last_reverified_at", { withTimezone: true }),
  periodicReverificationDueAt: timestamp("periodic_reverification_due_at", {
    withTimezone: true,
  }),
  trustScore: numeric("trust_score").notNull().default("50"),
  cooldownState: boolean("cooldown_state").notNull().default(false),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  priorSafetyFlagsCount: integer("prior_safety_flags_count").notNull().default(0),
  duplicateDetectionRisk: boolean("duplicate_detection_risk").notNull().default(false),
  /* Written by src/lib/identity-resolve.ts. Before 2026-10-28 these columns
     existed with no writer anywhere: trust_score and duplicate_detection_risk
     were readable in the schema but never computed, so the "trust system" was
     a schema fixture rather than a control. */
  scamFlags7d: integer("scam_flags_7d").notNull().default(0),
  scamFlagLastAt: timestamp("scam_flag_last_at", { withTimezone: true }),
  duplicatePhotoHits: integer("duplicate_photo_hits").notNull().default(0),
  sharedDeviceAccounts: integer("shared_device_accounts").notNull().default(0),
  suppressionActive: boolean("suppression_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- Preview-room matches (mirrors Freeborn user_matches shape) ---------- */

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userA: uuid("user_a")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    userB: uuid("user_b")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    initiatedBy: uuid("initiated_by").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    unique("matches_pair_unique").on(t.userA, t.userB),
    check("matches_no_self", sql`${t.userA} <> ${t.userB}`),
    check("matches_ordered", sql`${t.userA} < ${t.userB}`),
    check("matches_status_check", sql`${t.status} in ('active','archived','blocked')`),
  ]
);

/* --- Preview-room messages (mirrors Freeborn match_messages shape) ------- */

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Scam-guard tripped on this message → the recipient sees a safety warning. */
    flagged: boolean("flagged").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check("messages_body_length", sql`char_length(${t.body}) between 1 and 2000`),
    index("messages_match_created_idx").on(t.matchId, t.createdAt),
  ]
);

/* --- Message reactions (hold-to-react, double-tap to love) ---------------- */

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    unique("message_reactions_unique").on(t.messageId, t.userId, t.emoji),
    index("message_reactions_message_idx").on(t.messageId),
  ]
);

/* --- Identity verification engine ----------------------------------------- */

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    method: text("method").notNull().default("selfie"),
    selfieMedia: text("selfie_media"),
    rejectReason: text("reject_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().default(utcNow),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("verification_requests_account_idx").on(t.accountId),
    check(
      "verification_status_check",
      sql`${t.status} in ('pending','approved','rejected')`
    ),
  ]
);

/* --- Member reports (moderation queue) ------------------------------------ */

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    subjectId: uuid("subject_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull().default("other"),
    details: text("details"),
    status: text("status").notNull().default("open"),
    /* Who filed this. "member" = a member reported another member, and it is
       triaged by two engines on arrival so severity and triageSummary are
       filled. "identity_gate" = api/profile/photos filed it automatically after
       a high-confidence mismatch rejected an upload: a receipt for a decision
       already taken and already told to the member, never triaged, and not an
       accusation by one person about another. Reading the live queue is what
       surfaced the need: both open reports were gate receipts sitting
       indistinguishable among member complaints. */
    origin: text("origin").notNull().default("member"),
    /** AI triage severity — filled by the moderation engine on arrival. */
    severity: text("severity"),
    triageSummary: text("triage_summary"),
    /** 'complete' = both engines returned a verdict, 'pending' = unavailable/over budget.
     *  Stored because the queue's meaning changes completely with it: with no engine keys
     *  configured every member report is legitimately unjudged, and an operator must be
     *  able to tell that apart from "nobody has looked yet" without guessing. */
    triage: text("triage"),
    /* Human review. `status` records that a report was closed; these record
       who closed it, when, and on what ground. `resolution` is deliberately
       separate from `triageSummary`, which is the AI reading and must not be
       mistaken for a person's judgement. */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    index("reports_subject_idx").on(t.subjectId),
    /* LIVE-DEFECT (found 2026-10-29, measured against production): the deployed
     * `reports_reason_check` enumerated 12 values copied from an early list
     * (inappropriate_content, spam, nudity, violence, selfie_mismatch, …) and did NOT
     * contain 'safety'. `POST /api/reports` with reason="safety" therefore raised
     * 23514 out of the unguarded insert at reports/route.ts:95 and returned 500 — a
     * member's report was silently destroyed. Reproduced directly:
     *   insert into reports(reason) values ('safety')  ->  ERROR: 23514
     * The CHECK and this list are now the same set, plus the legacy values that older
     * rows already carry so the constraint can never be re-narrowed under existing data.
     * The route additionally never inserts an unlisted reason (see safeReason). */
    check(
      "reports_reason_check",
      sql`${t.reason} in ('fake_profile','scam','harassment','safety','underage','inappropriate_media','ai_generated_media','other','inappropriate_content','spam','nudity','violence','selfie_mismatch')`
    ),
    check("reports_origin_check", sql`${t.origin} in ('member','identity_gate')`),
  ]
);

/* --- Security & trust layer ------------------------------------------------- */

/** Every security signal we observe — IP reputation hits, GPS spoof suspects,
    automated-traffic blocks. One row per event, kept forever for review. */
export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    ip: text("ip"),
    kind: text("kind").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [index("security_events_email_idx").on(t.email), index("security_events_ip_idx").on(t.ip)]
);

/** Warnings — the step BEFORE any suspension for behavior issues. Accounts
    are warned first; only hard evidence (automated traffic) suspends. */
export const warnings = pgTable(
  "warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    kind: text("kind").notNull().default("behavior"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [index("warnings_email_idx").on(t.email)]
);

/** Appeals: suspended members plead their case. The security record, plus two
    models when the engines are available, inform the operator's decision. No
    code path sets suspensions.active to false, so reinstatement is manual. */
export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    detail: text("detail").notNull(),
    status: text("status").notNull().default("under_review"),
    verdict: text("verdict"),
    investigation: text("investigation"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /* `verdict` is rendered to the member verbatim by appeal-experience.tsx, so
       it must read as something a person would say to them. No application code
       writes it or `reviewedBy`: a decision is an operator act performed through
       the runbook in REVIEW-SURFACE-DESIGN.md, which records it in
       moderation_actions in the same transaction. */
    reviewedBy: text("reviewed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [index("appeals_email_idx").on(t.email)]
);

/** Suspended accounts — datacenter/automated signups land here and are
    bounced back to the auth screen with a policy notice on every retry. */
export const suspensions = pgTable(
  "suspensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ip: text("ip"),
    reason: text("reason").notNull().default("privacy_policy"),
    active: boolean("active").notNull().default(true),
    /* Clearing a suspension used to be a bare UPDATE that left no trace of who
       did it, when, or why. These columns are written by the operator runbook,
       never by application code: there is still no route that lifts one. Rows
       inserted by /api/security/check for datacenter sign-in ranges are
       attributed by their own `reason` and `ip`, which is the machine actor. */
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
    liftedBy: text("lifted_by"),
    liftNote: text("lift_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [index("suspensions_email_idx").on(t.email)]
);

/* --- Moderation audit log ---------------------------------------------------
   Append-only record of human moderation acts, written by the operator runbook
   in the same transaction as the act it describes. Never updated, never deleted:
   an audit log the operator can quietly edit is not an audit log.

   RLS is enabled on this table and it carries zero policies, so an anon or
   authenticated role reads no rows through PostgREST and the publishable key in
   the client bundle cannot reach it. The application reads and writes it as
   postgres, which bypasses RLS. That is only safe while no operator route
   exists: the moment one does, its own authentication is the only thing between
   the internet and a log of every act taken against every member, and
   REVIEW-SURFACE-DESIGN.md section 5 lists the seven preconditions it must
   satisfy first, each answering a specific Unjected failure. */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    /** report_dismissed | report_upheld | appeal_cleared | appeal_rejected |
        member_suspended | suspension_lifted */
    action: text("action").notNull(),
    /** report | appeal | suspension | member */
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id"),
    subjectEmail: text("subject_email"),
    reason: text("reason"),
    /** The reasoning a member could be told aloud. If it could not be, the act
        probably should not have been taken. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    // Matches production: created_at DESC, so the newest act is the cheap read.
    index("moderation_actions_created_idx").on(sql`${t.createdAt} desc`),
    index("moderation_actions_subject_idx").on(t.subjectId),
  ]
);

/* --- Chat media store (voice notes, photos, videos) ------------------------
   Stored locally so delivery works end-to-end without depending on external
   storage buckets. Blobs are bytea; ids are random uuids. ------------------ */

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const chatMedia = pgTable(
  "chat_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id").references(() => userProfiles.id, {
      onDelete: "set null",
    }),
    /** The conversation this attachment belongs to. REQUIRED to authorise
        reads — without it there is no way to prove the requester is a
        participant, which is how /api/chat/media/:id ended up serving private
        photos and voice notes to anyone who had the id. Nullable only because
        rows uploaded before the column existed have no value; those fall back
        to sender-only access. See db/migrations/2026-10-16-rls-and-media-ownership.sql */
    matchId: uuid("match_id").references(() => matches.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("voice"),
    mime: text("mime").notNull().default("application/octet-stream"),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check("chat_media_kind_check", sql`${t.kind} in ('image','video','voice')`),
    index("chat_media_match_idx").on(t.matchId),
  ]
);

/* --- Real-life mixer interest (the growth engine Unjected never built) ----- */

export const eventInterests = pgTable(
  "event_interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [unique("event_interests_user_unique").on(t.userId), index("event_interests_city_idx").on(t.city)]
);

/* --- Venue consent: a mixer may never name a venue that has not agreed ------
 *
 * Unjected announced a Denver mixer at a venue that had never agreed to host
 * it. The venue was harassed into cancelling and Unjected sued it; an amended
 * federal complaint followed in September 2026. The failure was not malice. It
 * was the absence of anywhere to record consent, so nothing forced anyone to
 * obtain it before publishing a venue name.
 *
 * This table is that place. There is deliberately no insert path in product
 * code: a consent row is an operator act, written out of band with the venue's
 * written agreement captured in consent_note. Any future announcement route
 * must call requireVenueConsent() from src/lib/mixer-consent.ts, which throws
 * unless an un-withdrawn consent row exists for the city and venue.
 */
export const mixerVenues = pgTable(
  "mixer_venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: text("city").notNull(),
    venueName: text("venue_name").notNull(),
    /** Who at the venue agreed, by name or role. */
    consentGivenBy: text("consent_given_by").notNull(),
    /** How the agreement was captured: email, signed form, contract. */
    consentMethod: text("consent_method").notNull(),
    /** Where the written agreement lives, or its full text. */
    consentNote: text("consent_note").notNull(),
    consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }).notNull().default(utcNow),
    /** A venue can change its mind; announcements must re-check. */
    consentWithdrawnAt: timestamp("consent_withdrawn_at", { withTimezone: true }),
  },
  (t) => [index("mixer_venues_city_idx").on(t.city)]
);

/* --- Support messages (real humans, no canned replies) --------------------- */

export const supportRequests = pgTable("support_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => userProfiles.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  email: text("email"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
});

/* --- Cross-account identity evidence --------------------------------------
   Recovered design (see RE-MECHANICS.md): Tinder stores a face map/vector "to verify
   new photos, detect fraud, and prevent duplicate accounts" and Hinge "scans for
   duplicate faces among profile images". Freeborn stores NO biometric template: the
   anchor here is a deterministic fold of the member's own perceptual photo hashes,
   re-derivable from photos the row already links to, carrying nothing about a face.
   RLS: enabled + forced + zero policies, so the publishable key in a browser bundle
   cannot read it; only service_role and the postgres owner (bypassrls) touch it. */

export const identityFingerprints = pgTable(
  "identity_fingerprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    photoDhash: bit64("photo_dhash"),
    photoAhash: bit64("photo_ahash"),
    anchor: bit64("anchor").notNull(),
    selfieCheckId: uuid("selfie_check_id"),
    engineDecision: text("engine_decision"),
    engineConfidence: text("engine_confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check(
      "identity_fingerprints_source_check",
      sql`${t.source} in ('verification','photo_upload','backfill')`
    ),
    check(
      "identity_fingerprints_decision_check",
      sql`${t.engineDecision} is null or ${t.engineDecision} in ('match','mismatch','unclear')`
    ),
    check(
      "identity_fingerprints_confidence_check",
      sql`${t.engineConfidence} is null or ${t.engineConfidence} in ('high','medium','low','unknown')`
    ),
    index("identity_fingerprints_user_idx").on(t.userId, sql`${t.createdAt} desc`),
    index("identity_fingerprints_anchor_idx").on(t.anchor),
    index("identity_fingerprints_dhash_idx").on(t.photoDhash),
  ]
);

/* --- Device linkage --------------------------------------------------------
   A per-install random id the CLIENT chooses to send (as Tinder's
   persistent-device-id and Bumble's device_id are client-held), hashed server-side.
   Deliberately NOT a browser fingerprint: no canvas/WebGL/audio derivation, because
   a dating app must not quietly build a cross-account tracker it has not disclosed. */

export const accountDevices = pgTable(
  "account_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    deviceHash: bit64("device_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().default(utcNow),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(utcNow),
    seenCount: integer("seen_count").notNull().default(1),
    /* Cadence signal, modelled on Tinder's app/user-session-elapsed headers: the
       client's claimed install age vs this account's age. Review priority only. */
    installAgeMs: bigint("install_age_ms", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("account_devices_one_row_per_pair").on(t.userId, t.deviceHash),
    index("account_devices_hash_idx").on(t.deviceHash, sql`${t.lastSeenAt} desc`),
  ]
);

/* --- Graduated enforcement cases ------------------------------------------
   The ladder recovered from Tinder's client: warning -> suppression -> suspension ->
   ban, with the four VIOLATING_* classes and one resolution code per removal kind.
   Suppression is the tier Freeborn was missing: the reversible middle step that makes
   acting on a signal proportionate instead of all-or-nothing. */

export const enforcementCases = pgTable(
  "enforcement_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "cascade" }),
    email: citext("email"),
    tier: text("tier").notNull(),
    state: text("state").notNull().default("open"),
    violatedClass: text("violated_class").notNull(),
    code: text("code").notNull(),
    /** What the system observed. Machine words, not shown verbatim to the subject. */
    detail: text("detail"),
    /** What a member may be told. If it cannot be written, the case should not open. */
    notes: text("notes"),
    trustDelta: integer("trust_delta").notNull().default(0),
    resolution: text("resolution"),
    openedBy: text("opened_by").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check("enforcement_cases_tier_check", sql`${t.tier} in ('warning','suppression','suspension','ban')`),
    check(
      "enforcement_cases_state_check",
      sql`${t.state} in ('open','in_review','acknowledged','appealable','resolved')`
    ),
    check(
      "enforcement_cases_class_check",
      sql`${t.violatedClass} in ('violation_personal_content','violation_profile_content','violation_media','violation_behavior','violation_identity')`
    ),
    check(
      "enforcement_cases_resolution_check",
      sql`${t.resolution} is null or ${t.resolution} in ('denied','warning_removed','content_reinstated','suppression_removed','suspension_removed','ban_removed')`
    ),
    check(
      "enforcement_cases_actor_check",
      sql`${t.openedBy} in ('system','identity_engine','moderation_engine','operator','member_report')`
    ),
    /* One live case per (member, tier): a heuristic that fires weekly must not
       stack identical cases into a ratchet. */
    uniqueIndex("enforcement_cases_one_live_per_tier").on(t.userId, t.tier, t.state),
    index("enforcement_cases_user_idx").on(t.userId, sql`${t.createdAt} desc`),
    index("enforcement_cases_open_idx")
      .on(t.state, t.tier)
      .where(sql`${t.state} in ('open','in_review')`),
    index("enforcement_cases_email_idx").on(t.email),
  ]
);

/* --- Human challenge seam --------------------------------------------------
   Tinder files a ban appeal with an Arkose token (appealChallengeToken) and gates
   login behind POST /v2/auth/verify-captcha. No captcha provider is configured on
   this project, so this is the seam, not the protection: a nonce + verify endpoint
   that a real provider plugs into later. The route records whether it ENFORCED. */

export const humanChallenges = pgTable(
  "human_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull(),
    purpose: text("purpose").notNull(),
    tokenHash: bit64("token_hash").notNull(),
    /* The server-issued random. Stored (and only this) so verification can recompute
       the prefix without a session, and so a row is meaningful in a review. It is
       random, single-use, and 15-minute-lived: nothing about the member. */
    nonce: text("nonce").notNull().unique(),
    difficultyBits: integer("difficulty_bits").notNull().default(20),
    status: text("status").notNull().default("issued"),
    attempts: integer("attempts").notNull().default(0),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().default(utcNow),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`timezone('utc', now()) + interval '15 minutes'`),
    solvedAt: timestamp("solved_at", { withTimezone: true }),
  },
  (t) => [
    /* 'verification' added 2026-10-29: a selfie/liveness attempt must be attributable to
     * a server-issued, single-use, expiring challenge, otherwise `liveness.blink` is a
     * free self-declaration the member can precompute once and replay forever. See
     * /api/verification/challenge and RE-EVIDENCE-GAP-REPORT.md §5. */
    check(
      "human_challenges_purpose_check",
      sql`${t.purpose} in ('appeal','signup','reset','verification')`
    ),
    check(
      "human_challenges_status_check",
      sql`${t.status} in ('issued','solved','failed','expired')`
    ),
    /* ONE LIVE CHALLENGE PER (email, purpose) — enforced as a PARTIAL unique index.
     *
     * This used to be `unique(email, purpose, status)`, which is not the same rule and
     * locked members out. `/api/verification/challenge` and `/api/human/issue` both
     * "expire my previous issued row, then insert a new one"; with `status` inside the
     * key, the second abandoned attempt left TWO rows that both read
     * (email,'verification','expired'), so the UPDATE that expires previous rows threw
     * 23505 unique_violation and the member could never obtain a token again — no
     * try/catch anywhere on that path, and the tables are shared with appeals and
     * password resets, so one stale row stranded all three flows.
     *
     * The rule the code actually wants: any number of historical rows, at most one in
     * 'issued'. Say exactly that, in the index predicate. Purposes in play today:
     * 'verification' (this route) and 'appeal' | 'signup' | 'reset' (/api/human/issue,
     * which runs the same expire-then-insert statement and is equally unwrapped). */
    uniqueIndex("human_challenges_single_live")
      .on(t.email, t.purpose)
      .where(sql`${t.status} = 'issued'`),
    index("human_challenges_email_idx").on(t.email, sql`${t.issuedAt} desc`),
  ]
);
