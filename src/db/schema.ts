/* ==========================================================================
   FREEBORN — LOCAL SCHEMA
   Mirrors supabase/migrations exactly (all 11 migration files), with
   `accounts` standing in for Supabase's managed auth.users.
   ========================================================================== */

import { sql } from "drizzle-orm";
import {
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
  challengeToken: text("challenge_token").notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    check("messages_body_length", sql`char_length(${t.body}) between 1 and 2000`),
    index("messages_match_created_idx").on(t.matchId, t.createdAt),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [
    index("reports_subject_idx").on(t.subjectId),
    check(
      "reports_reason_check",
      sql`${t.reason} in ('fake_profile','scam','harassment','safety','underage','inappropriate_media','other')`
    ),
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
    kind: text("kind").notNull().default("voice"),
    mime: text("mime").notNull().default("application/octet-stream"),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(utcNow),
  },
  (t) => [check("chat_media_kind_check", sql`${t.kind} in ('image','video','voice')`)]
);
