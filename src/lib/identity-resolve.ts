/**
 * FREEBORN IDENTITY RESOLUTION — cross-account duplication, device linkage, cases, trust.
 *
 * Everything here runs on the server, on the postgres/service connection, and NEVER
 * auto-destroys an account. It produces FACTS ("this photo already exists on another
 * account"), records them, opens enforcement cases through moderation-policy.ts, and lets
 * computeTrustScore move. A human closes the cases.
 *
 * Recovered inputs (RE-MECHANICS.md §1b, §1c, §4): Tinder keys every auth/onboarding/ban
 * request to a `persistent-device-id` and keeps a face map "to detect duplicate profiles and
 * prevent duplicate accounts"; Hinge's Face Check "scans for duplicate faces among profile
 * images"; Match Group's stated purpose for the mandate is "to prevent users from making
 * multiple accounts and ensure banned users can't make new accounts".
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountDevices,
  accounts,
  enforcementCases,
  identityFingerprints,
  securityEvents,
  userProfiles,
  userTrustHistory,
} from "@/db/schema";
import { hamming64, type PhotoHashes } from "@/lib/photo-hash";
import { decidePolicy, type CaseInput, type Tier } from "@/lib/moderation-policy";
import { computeTrustScore, trustScoreToNumeric, type TrustSignals } from "@/lib/trust-score";

/* A dHash within 6 bits of another account's, with the aHash also close, is the same
   picture. Within 3 is a byte-for-byte-equivalent re-upload. */
export const DUP_PHOTO_EXACT = 3;
export const DUP_PHOTO_NEAR = 6;
/** Upper bound on rows scanned per upload; see `scanned`/`truncated` in the result. */
const DUP_SCAN_LIMIT = 20000;

const BIT64 = /^[0-9a-f]{16}$/i;

export type DuplicateHit = {
  photoId: string;
  userId: string;
  email: string | null;
  /** null when the match came from the exact-bytes digest alone (no comparable perceptual hash). */
  distance: number | null;
  exact: boolean;
  suspended: boolean;
};

export type DuplicateReport = {
  hits: DuplicateHit[];
  scanned: number;
  truncated: boolean;
  /** set when the check could not run at all — never report "clean" in that case */
  error: string | null;
};

/** Deterministic 64-bit hash of a client-held install id. Only the hash is stored: a raw id
    in a table would be a tracking cookie with a database column, and the goal is linkage. */
export function hashInstallId(installId: string | null | undefined): string | null {
  const v = installId?.trim();
  if (!v || v.length < 8 || v.length > 200) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return createHash("sha256").update(`freeborn-device-v1:${v}`).digest().subarray(0, 8).toString("hex");
}

/**
 * Find this photo on OTHER accounts.
 *
 * One SQL round-trip fetches candidate hashes; the Hamming comparison then uses
 * lib/photo-hash.hamming64(), which scripts/hashing/hamming-parity.mjs proves agrees with
 * the public.hamming64() the schema exposes. Thresholds live in this module, not in SQL, so
 * the app and an operator query can never drift apart silently.
 */
export async function findDuplicatePhotos(
  selfUserId: string,
  hashes: { d: string; a: string | null; bytes?: string | null }
): Promise<DuplicateReport> {
  const empty: DuplicateReport = { hits: [], scanned: 0, truncated: false, error: null };
  const hasPerceptual = BIT64.test(hashes.d);
  const hasExact = typeof hashes.bytes === "string" && /^[0-9a-f]{64}$/i.test(hashes.bytes);
  /* A caller with an exact digest but no usable perceptual hash (an undecodable-but-
     recordable image) can still be matched on bytes, so neither form alone is a reason
     to skip the scan. Skipping only when NEITHER is present. */
  if (!hasPerceptual && !hasExact) return { ...empty, error: "invalid-hash" };

  type Row = {
    id: string;
    user_id: string;
    email: string | null;
    phash_d: string | null;
    phash_a: string | null;
    phash_bytes: string | null;
    suspended: boolean | null;
  };

  let rows: Row[] = [];
  try {
    const res = await db.execute<Row>(sql`
      select pp.id,
             pp.user_id,
             up.email,
             pp.phash_d::text as phash_d,
             pp.phash_a::text as phash_a,
             pp.phash_bytes::text as phash_bytes,
             exists (
               select 1 from public.suspensions s where s.email = up.email and s.active
             ) as suspended
        from public.profile_photos pp
        join public.user_profiles up on up.id = pp.user_id
       where pp.user_id <> ${selfUserId}
         /* hashable OR byte-recorded: a photo we could only sha256 still has to be
            comparable, otherwise the exact-bytes control has nothing to scan */
         and (pp.phash_d is not null or pp.phash_bytes is not null)
       order by pp.created_at desc
       limit ${sql.raw(String(DUP_SCAN_LIMIT))}
    `);
    rows = (res as unknown as { rows?: Row[] }).rows ?? (res as unknown as Row[]);
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message.slice(0, 160) : "query-failed" };
  }

  const hits: DuplicateHit[] = [];
  for (const r of rows) {
    /* TWO INDEPENDENT WAYS TO MATCH, either one is enough:
       (1) EXACT BYTES. A sha256 collision on a file digest does not happen by accident, so
           a byte-identical file under two accounts is the same file. This is what survives a
           crop — a global perceptual hash does NOT (measured in scripts/trust/harness.ts:
           a 5% crop already breaks the near-boundary), so without this the cheapest evasion
           in the wild — download, re-upload unchanged — would be invisible.
       (2) PERCEPTUAL DISTANCE. dHash within DUP_PHOTO_NEAR, corroborated by aHash, which
           catches the re-save / resize / recompress family that changes the bytes. */
    const sameBytes =
      Boolean(hashes.bytes) && Boolean(r.phash_bytes) && hashes.bytes === r.phash_bytes;
    if (!r.phash_d && !sameBytes) continue;
    const dh = r.phash_d && hasPerceptual ? hamming64(hashes.d, r.phash_d) : null;
    if (!sameBytes && (dh === null || dh > DUP_PHOTO_NEAR)) continue;
    const ah = hashes.a && r.phash_a ? hamming64(hashes.a, r.phash_a) : null;
    // Structure matched but appearance did not: a generic layout, not a copy.
    if (!sameBytes && ah !== null && ah > 12) continue;
    hits.push({
      photoId: r.id,
      userId: r.user_id,
      email: r.email,
      distance: dh,
      exact: sameBytes || (dh !== null && dh <= DUP_PHOTO_EXACT),
      suspended: Boolean(r.suspended),
    });
  }
  return { hits, scanned: rows.length, truncated: rows.length >= DUP_SCAN_LIMIT, error: null };
}

/** Record which device a member used, and report what else shares it. */
export type DeviceFact = {
  deviceHash: string;
  accountsOnDevice: number;
  otherUsers: string[];
  suspendedCoTenants: number;
  /** minutes between the client's claimed install age and this account's age */
  installVsAccountSkewMs: number | null;
};

export async function observeDevice(
  userId: string,
  installId: string | null | undefined,
  opts: { installAgeMs?: number | null; accountCreatedAt?: Date | null } = {}
): Promise<DeviceFact | null> {
  const deviceHash = hashInstallId(installId ?? null);
  if (!deviceHash) return null;

  const installAgeMs =
    typeof opts.installAgeMs === "number" && Number.isFinite(opts.installAgeMs)
      ? Math.max(0, Math.min(opts.installAgeMs, 1000 * 60 * 60 * 24 * 3650))
      : null;

  /* Upsert by hand. drizzle's update() cannot carry ON CONFLICT, and a unique
     violation from two concurrent requests on one device must never surface as
     a failed login or a dropped upload. */
  const [existing] = await db
    .select({ id: accountDevices.id, seenCount: accountDevices.seenCount, installAgeMs: accountDevices.installAgeMs })
    .from(accountDevices)
    .where(and(eq(accountDevices.userId, userId), eq(accountDevices.deviceHash, deviceHash)))
    .limit(1);

  if (existing) {
    await db
      .update(accountDevices)
      .set({
        lastSeenAt: sql`timezone('utc', now())`,
        seenCount: existing.seenCount + 1,
        installAgeMs: installAgeMs ?? existing.installAgeMs ?? null,
      })
      .where(eq(accountDevices.id, existing.id));
  } else {
    try {
      await db.insert(accountDevices).values({ userId, deviceHash, seenCount: 1, installAgeMs });
    } catch {
      /* lost the race: another request inserted the row, which is the outcome we wanted */
    }
  }

  const rows = await db
    .select({ userId: accountDevices.userId, email: userProfiles.email })
    .from(accountDevices)
    .innerJoin(userProfiles, eq(userProfiles.id, accountDevices.userId))
    .where(eq(accountDevices.deviceHash, deviceHash));

  const otherUsers = [...new Set(rows.map((r) => r.userId))].filter((u) => u !== userId);
  const otherEmails = rows.filter((r) => r.userId !== userId).map((r) => r.email).filter((e): e is string => Boolean(e));

  let suspendedCoTenants = 0;
  if (otherEmails.length) {
    const [c] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(accounts)
      .where(
        and(
          inArray(accounts.email, otherEmails),
          sql`exists (select 1 from public.suspensions s where s.email = ${accounts.email} and s.active)`
        )
      );
    suspendedCoTenants = Number(c?.c ?? 0);
  }

  let skew: number | null = null;
  if (installAgeMs !== null && opts.accountCreatedAt) {
    skew = installAgeMs - (Date.now() - new Date(opts.accountCreatedAt).getTime());
  }

  return {
    deviceHash,
    accountsOnDevice: otherUsers.length + 1,
    otherUsers,
    suspendedCoTenants,
    installVsAccountSkewMs: skew,
  };
}

/** Store the derived anchor for one member so "same visual identity, twice" is one compare. */
export async function upsertFingerprint(args: {
  userId: string;
  source: "verification" | "photo_upload" | "backfill";
  hashes: PhotoHashes | null;
  anchor: string | null;
  selfieCheckId?: string | null;
  /** Widened to string on purpose: identity-match narrows MatchOutcome differently per
      call site, and this column is an audit annotation, not a decision. */
  engine?: { decision: string; confidence: string } | null;
}): Promise<boolean> {
  const { userId, source, hashes, anchor, selfieCheckId, engine } = args;
  if (!anchor || !BIT64.test(anchor)) return false;
  try {
    await db.insert(identityFingerprints).values({
      userId,
      source,
      photoDhash: hashes && BIT64.test(hashes.d) ? hashes.d : null,
      photoAhash: hashes && BIT64.test(hashes.a) ? hashes.a : null,
      anchor,
      selfieCheckId: selfieCheckId ?? null,
      // The CHECK on this column only accepts match/mismatch/unclear, so an
      // unexpected value is stored as null rather than breaking the write.
      engineDecision:
        engine?.decision === "match" || engine?.decision === "mismatch" || engine?.decision === "unclear"
          ? engine.decision
          : null,
      engineConfidence:
        engine?.confidence === "high" ||
        engine?.confidence === "medium" ||
        engine?.confidence === "low" ||
        engine?.confidence === "unknown"
          ? engine.confidence
          : null,
    });
    return true;
  } catch {
    /* a fingerprint write must never break verification */
    return false;
  }
}

/** Anchor shared with another account = the duplicate-identity fact itself. */
export async function findSharedAnchor(
  userId: string,
  anchor: string
): Promise<{ users: string[]; suspended: number; scanned: number }> {
  if (!BIT64.test(anchor)) return { users: [], suspended: 0, scanned: 0 };
  const rows = await db
    .select({ userId: identityFingerprints.userId, email: userProfiles.email })
    .from(identityFingerprints)
    .innerJoin(userProfiles, eq(userProfiles.id, identityFingerprints.userId))
    .where(and(eq(identityFingerprints.anchor, anchor), sql`${identityFingerprints.userId} <> ${userId}`));

  const users = [...new Set(rows.map((r) => r.userId))];
  const emails = rows.map((r) => r.email).filter((e): e is string => Boolean(e));
  if (!users.length) return { users: [], suspended: 0, scanned: rows.length };

  const [c] = emails.length
    ? await db
        .select({ c: sql<number>`count(*)::int` })
        .from(accounts)
        .where(
          and(
            inArray(accounts.email, emails),
            sql`exists (select 1 from public.suspensions s where s.email = ${accounts.email} and s.active)`
          )
        )
    : [{ c: 0 }];
  return { users, suspended: Number(c?.c ?? 0), scanned: rows.length };
}

/* ------------------------------------------------------------------ cases -- */

export type CaseResult = {
  opened: boolean;
  tier: Tier | null;
  reason: string;
  caseId: string | null;
  reviewRequired: boolean;
};

/** Apply policy to one signal and record the outcome. Idempotent per live (member, tier). */
export async function openCase(args: {
  userId: string;
  email: string | null;
  input: CaseInput;
}): Promise<CaseResult> {
  const decision = decidePolicy(args.input);
  if (!decision.open || !decision.tier) {
    return { opened: false, tier: null, reason: decision.reason, caseId: null, reviewRequired: decision.reviewRequired };
  }
  const tier = decision.tier;

  const live = await db
    .select({ id: enforcementCases.id })
    .from(enforcementCases)
    .where(
      and(
        eq(enforcementCases.userId, args.userId),
        eq(enforcementCases.tier, tier),
        inArray(enforcementCases.state, ["open", "in_review", "acknowledged"])
      )
    )
    .limit(1);
  if (live.length) {
    return { opened: false, tier, reason: `already_open:${live[0].id}`, caseId: live[0].id, reviewRequired: decision.reviewRequired };
  }

  const [row] = await db
    .insert(enforcementCases)
    .values({
      userId: args.userId,
      email: args.email,
      tier,
      state: "open",
      violatedClass: args.input.violatedClass,
      code: args.input.code,
      detail: args.input.detail.slice(0, 4000),
      notes: args.input.notes.slice(0, 2000),
      trustDelta: decision.trustDelta,
      openedBy: args.input.openedBy,
      dueAt: decision.autoExpireDays
        ? sql`timezone('utc', now()) + interval '${sql.raw(String(decision.autoExpireDays))} days'`
        : null,
    })
    .returning({ id: enforcementCases.id });

  await db.insert(securityEvents).values({
    email: args.email ?? undefined,
    kind: `case_${tier}:${args.input.code}`.slice(0, 80),
    detail: `tier=${tier} review_required=${decision.reviewRequired ? 1 : 0} trust_delta=${decision.trustDelta} case=${row?.id ?? "?"}`,
  });

  return { opened: true, tier, reason: decision.reason, caseId: row?.id ?? null, reviewRequired: decision.reviewRequired };
}

/* ------------------------------------------------------------------- trust -- */

/** Recompute one member's trust score from live rows and write it back. */
export async function recomputeTrust(userId: string): Promise<{ signals: TrustSignals; score: number; band: string }> {
  const [profile] = await db
    .select({ id: userProfiles.id, email: userProfiles.email, isVerified: userProfiles.isVerified })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  const [acct] = profile
    ? await db
        .select({ createdAt: accounts.createdAt, confirmedAt: accounts.emailConfirmedAt })
        .from(accounts)
        .where(eq(accounts.email, profile.email))
        .limit(1)
    : [undefined];

  const [hist] = await db.select().from(userTrustHistory).where(eq(userTrustHistory.userId, userId)).limit(1);

  const [ev] = await db
    .select({
      gps: sql<number>`count(*) filter (where kind = 'gps-spoof-suspect')::int`,
      auto: sql<number>`count(*) filter (where kind in ('automated-traffic','datacenter-ip','rate-limited'))::int`,
    })
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.email, profile?.email ?? "__none__"),
        sql`created_at >= timezone('utc', now()) - interval '7 days'`
      )
    );

  const [cases] = await db
    .select({
      warnings: sql<number>`count(*) filter (where tier = 'warning' and state <> 'resolved')::int`,
      suppressions: sql<number>`count(*) filter (where tier = 'suppression' and state <> 'resolved')::int`,
    })
    .from(enforcementCases)
    .where(eq(enforcementCases.userId, userId));

  const signals: TrustSignals = {
    verified: Boolean(profile?.isVerified),
    emailConfirmed: Boolean(acct?.confirmedAt),
    accountAgeDays: acct?.createdAt ? Math.max(0, (Date.now() - new Date(acct.createdAt).getTime()) / 86_400_000) : 0,
    verificationAttempts: hist?.verificationAttempts ?? 0,
    verificationSuccesses: hist?.verificationSuccesses ?? 0,
    verificationFailures: hist?.verificationFailures ?? 0,
    mismatchHistoryCount: hist?.mismatchHistoryCount ?? 0,
    duplicatePhotoHits: hist?.duplicatePhotoHits ?? 0,
    sharedDeviceAccounts: hist?.sharedDeviceAccounts ?? 0,
    gpsSpoofSuspects7d: Number(ev?.gps ?? 0),
    automatedTrafficBlocks7d: Number(ev?.auto ?? 0),
    scamFlags7d: hist?.scamFlags7d ?? 0,
    openWarnings: Number(cases?.warnings ?? 0),
    openSuppressions: Number(cases?.suppressions ?? 0),
    enginesAvailable: Boolean(process.env.ANTIGRAVITY_FREE_API_KEY || process.env.VOID_AI_API_KEY),
  };

  const result = computeTrustScore(signals);
  const suppressionActive = signals.openSuppressions > 0;
  const payload = {
    trustScore: trustScoreToNumeric(result),
    suppressionActive,
    duplicateDetectionRisk: signals.duplicatePhotoHits > 0,
    updatedAt: sql`timezone('utc', now())`,
  };

  if (hist) {
    await db.update(userTrustHistory).set(payload).where(eq(userTrustHistory.userId, userId));
  } else {
    try {
      await db.insert(userTrustHistory).values({ userId, ...payload });
    } catch {
      /* created concurrently; that row's value stands until the next recompute */
    }
  }

  return { signals, score: result.score, band: result.band };
}

/** Increment the durable scam-flag counter so a warned message is not a lost signal. */
export async function recordScamFlag(userId: string): Promise<void> {
  try {
    await db
      .update(userTrustHistory)
      .set({
        scamFlags7d: sql`case when scam_flag_last_at is not null and scam_flag_last_at < timezone('utc', now()) - interval '7 days' then 1 else scam_flags_7d + 1 end`,
        scamFlagLastAt: sql`timezone('utc', now())`,
        updatedAt: sql`timezone('utc', now())`,
      })
      .where(eq(userTrustHistory.userId, userId));
  } catch {
    /* best effort: never break a message send for a counter */
  }
}

export async function recordDuplicatePhotoHits(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  await db
    .update(userTrustHistory)
    .set({
      duplicatePhotoHits: sql`${userTrustHistory.duplicatePhotoHits} + ${count}`,
      updatedAt: sql`timezone('utc', now())`,
    })
    .where(eq(userTrustHistory.userId, userId));
}

export async function recordDeviceFanout(userId: string, accountsOnDevice: number): Promise<void> {
  await db
    .update(userTrustHistory)
    .set({
      sharedDeviceAccounts: sql`greatest(${userTrustHistory.sharedDeviceAccounts}, ${Math.max(0, accountsOnDevice - 1)})`,
      updatedAt: sql`timezone('utc', now())`,
    })
    .where(eq(userTrustHistory.userId, userId));
}

/** Suppression effect 1: this member is not to appear in anyone else's deck. */
export async function isSuppressed(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(enforcementCases)
    .where(and(eq(enforcementCases.userId, userId), eq(enforcementCases.tier, "suppression"), eq(enforcementCases.state, "open")))
    .limit(1);
  if (row) return true;
  const [hist] = await db
    .select({ s: userTrustHistory.suppressionActive })
    .from(userTrustHistory)
    .where(eq(userTrustHistory.userId, userId))
    .limit(1);
  return Boolean(hist?.s);
}

/** Members currently suppressed, for the discovery path to exclude in one query. */
export async function suppressedUserIds(limit = 500): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`
    /* MUST MATCH isSuppressed() EXACTLY, or the deck and the per-member check disagree and a
       suppressed account is still served to somebody. Two sources, unioned:
         1. an open suppression case (the enforcement record)
         2. user_trust_history.suppression_active (the cached flag the rest of the app reads) */
    select user_id from public.enforcement_cases
     where tier = 'suppression' and state = 'open'
    union
    select user_id from public.user_trust_history
     where suppression_active
    limit ${sql.raw(String(Math.max(1, Math.min(limit, 5000))))}`);
  const list = (rows as unknown as { rows?: { user_id: string }[] }).rows ?? (rows as unknown as { user_id: string }[]);
  return [...new Set((list ?? []).map((r) => r.user_id).filter((x): x is string => typeof x === "string"))];
}

/** Expiring suppression that nobody looked at: auto-mitigation, so a tier with a deadline
    actually ends. Runs from the heartbeat route, not a cron we do not have. */
export async function expireDueCases(): Promise<number> {
  const rows = await db
    .update(enforcementCases)
    .set({
      state: "resolved",
      resolution: sql`case when tier = 'warning' then 'warning_removed'
                         when tier = 'suppression' then 'suppression_removed'
                         when tier = 'suspension' then 'suspension_removed'
                         else 'ban_removed' end`,
      resolvedAt: sql`timezone('utc', now())`,
      resolvedBy: "system:auto_expire",
      notes: sql`coalesce(${enforcementCases.notes},'') || ' [auto-expired: the deadline passed with no human decision]'`,
      updatedAt: sql`timezone('utc', now())`,
    })
    .where(and(gt(enforcementCases.dueAt, sql`timezone('utc', now()) - interval '1 year'`), sql`${enforcementCases.dueAt} < timezone('utc', now())`, inArray(enforcementCases.state, ["open", "in_review"])))
    .returning({ id: enforcementCases.id });
  return rows.length;
}

/** Newest live cases for a member, with what they are allowed to do next. */
export async function listLiveCases(userId: string) {
  return db
    .select({
      id: enforcementCases.id,
      tier: enforcementCases.tier,
      state: enforcementCases.state,
      code: enforcementCases.code,
      notes: enforcementCases.notes,
      createdAt: enforcementCases.createdAt,
      dueAt: enforcementCases.dueAt,
      acknowledgedAt: enforcementCases.acknowledgedAt,
    })
    .from(enforcementCases)
    .where(and(eq(enforcementCases.userId, userId), inArray(enforcementCases.state, ["open", "in_review", "acknowledged", "appealable"])))
    .orderBy(desc(enforcementCases.createdAt));
}

/** Acknowledge a warning. The member-facing end of Tinder's warnings/acknowledge endpoint. */
export async function acknowledgeCase(userId: string, caseId: string): Promise<{ ok: boolean; error?: string }> {
  const [row] = await db
    .select({ id: enforcementCases.id, tier: enforcementCases.tier, state: enforcementCases.state })
    .from(enforcementCases)
    .where(and(eq(enforcementCases.id, caseId), eq(enforcementCases.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: "not-found" };
  if (row.state === "resolved") return { ok: false, error: "already-closed" };
  if (row.tier !== "warning") return { ok: false, error: "only-warnings-can-be-acknowledged" };

  await db
    .update(enforcementCases)
    .set({ state: "acknowledged", acknowledgedAt: sql`timezone('utc', now())`, updatedAt: sql`timezone('utc', now())` })
    .where(eq(enforcementCases.id, caseId));

  await db.insert(securityEvents).values({
    kind: "case_warning_acknowledged",
    detail: `case=${caseId}`,
  });
  return { ok: true };
}
