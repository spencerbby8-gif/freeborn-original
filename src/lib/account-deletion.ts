import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountDeletionRequests,
  profilePhotos,
  storageCleanupJobs,
  verificationSelfieChecks,
} from "@/db/schema";

export const DELETION_BUCKETS = ["profile-photos", "verification-selfies"] as const;
export type DeletionBucket = (typeof DELETION_BUCKETS)[number];

export type AccountDeletionResult = {
  statusToken: string;
  duplicate: boolean;
  completed: boolean;
  status: "cleanup_pending" | "completed" | "cleanup_failed";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_PATH_RE = /(^\/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|\/)\.\.(\/|$))/;

/**
 * Mirror of public.fb14_owned_storage_path. Cleanup may only name the member's
 * own folder, plus the legacy root-level selfie shape named after that member.
 * URLs, traversal, backslashes and bucket-root paths are never deletable.
 */
export function isOwnedStoragePath(accountId: string, bucket: DeletionBucket, path: string): boolean {
  if (!UUID_RE.test(accountId)) return false;
  const id = accountId.toLowerCase();
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (BAD_PATH_RE.test(path)) return false;
  if (path.startsWith(`${id}/`)) return true;
  return bucket === "verification-selfies" && new RegExp(`^selfie-${id}-[^/]+$`).test(path);
}

function ownedPaths(accountId: string, bucket: DeletionBucket, rows: Array<{ storagePath: string | null }>): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const path = row.storagePath;
    if (typeof path === "string" && isOwnedStoragePath(accountId, bucket, path)) out.add(path);
  }
  return [...out];
}

/**
 * Relational deletion + durable storage outbox in ONE transaction.
 *
 * The advisory lock makes repeated/concurrent delete requests idempotent. The
 * request row intentionally has no FK to accounts/auth.users: it must survive
 * the member row so an interrupted cleanup is still discoverable. A failure in
 * any relational DELETE rolls the whole transaction back, leaving no half-state
 * and no "success" response.
 */
export async function requestAccountDeletion(accountId: string, email: string): Promise<AccountDeletionResult> {
  const id = accountId.toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);

    const [existing] = await tx
      .select({
        statusToken: accountDeletionRequests.statusToken,
        status: accountDeletionRequests.status,
        storageCompletedAt: accountDeletionRequests.storageCompletedAt,
      })
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.accountId, id))
      .limit(1);
    if (existing) {
      return {
        statusToken: existing.statusToken,
        duplicate: true,
        completed: existing.status === "completed" && existing.storageCompletedAt !== null,
        status: existing.status as AccountDeletionResult["status"],
      };
    }

    const photoRows = await tx
      .select({ storagePath: profilePhotos.storagePath })
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, id));
    const selfieRows = await tx
      .select({ storagePath: verificationSelfieChecks.storagePath })
      .from(verificationSelfieChecks)
      .where(eq(verificationSelfieChecks.userId, id));

    const [request] = await tx
      .insert(accountDeletionRequests)
      .values({ accountId: id, status: "cleanup_pending" })
      .returning({ statusToken: accountDeletionRequests.statusToken });

    // Always enqueue both buckets. Even an account with no referenced objects
    // needs a prefix sweep, because orphaned objects may have no surviving row.
    await tx
      .insert(storageCleanupJobs)
      .values([
        {
          deletionAccountId: id,
          bucket: "profile-photos",
          ownerPrefix: `${id}/`,
          objectPaths: ownedPaths(id, "profile-photos", photoRows),
        },
        {
          deletionAccountId: id,
          bucket: "verification-selfies",
          ownerPrefix: `${id}/`,
          objectPaths: ownedPaths(id, "verification-selfies", selfieRows),
        },
      ])
      .onConflictDoNothing({ target: [storageCleanupJobs.deletionAccountId, storageCleanupJobs.bucket] });

    const del = (q: ReturnType<typeof sql>) => tx.execute(q);
    await del(sql`delete from public.verification_audit_logs where user_id = ${id}`);
    await del(sql`delete from public.profile_photos where user_id = ${id}`);
    await del(sql`delete from public.event_interests where user_id = ${id}`);
    await del(sql`delete from public.user_private_settings where user_id = ${id}`);
    await del(sql`delete from public.notification_preferences where user_id = ${id}`);
    await del(sql`delete from public.user_private_locations where user_id = ${id}`);
    await del(sql`delete from public.discovery_preferences where user_id = ${id}`);
    await del(sql`delete from public.user_trust_history where user_id = ${id}`);
    await del(sql`delete from public.verification_rate_limits where user_id = ${id}`);
    await del(sql`delete from public.verification_selfie_checks where user_id = ${id}`);
    await del(sql`delete from public.verification_challenges where user_id = ${id}`);
    await del(sql`delete from public.support_requests where account_id = ${id}`);
    await del(sql`delete from public.verification_requests where account_id = ${id}`);
    await del(sql`delete from public.sessions where account_id = ${id}`);
    await del(sql`delete from public.user_swipes where liker_id = ${id} or liked_id = ${id}`);
    await del(sql`delete from public.user_matches where user_a = ${id} or user_b = ${id}`);
    await del(sql`delete from public.blocked_users where blocker_id = ${id} or blocked_id = ${id}`);
    await del(sql`delete from public.reports where subject_id = ${id} or reporter_id = ${id}`);
    await del(sql`delete from public.warnings where email = ${normalizedEmail}`);
    await del(sql`delete from public.appeals where email = ${normalizedEmail}`);
    await del(sql`delete from public.suspensions where email = ${normalizedEmail}`);
    await del(sql`delete from public.security_events where email = ${normalizedEmail}`);
    await del(sql`delete from public.moderation_actions where subject_id = ${id} or subject_email = ${normalizedEmail}`);
    await del(sql`delete from public.chat_media where sender_id = ${id}`);
    await del(sql`delete from public.message_reactions where message_id in (select id from public.messages where match_id in (select id from public.matches where user_a = ${id} or user_b = ${id}))`);
    await del(sql`delete from public.messages where match_id in (select id from public.matches where user_a = ${id} or user_b = ${id})`);
    await del(sql`delete from public.call_sessions where caller_id = ${id} or callee_id = ${id}`);
    await del(sql`delete from public.matches where user_a = ${id} or user_b = ${id}`);
    await del(sql`delete from public.user_profiles where id = ${id}`);
    await del(sql`delete from public.accounts where id = ${id}`);
    // Auth-schema erasure goes through a pinned, service-role-only DEFINER
    // bridge so the app role never needs direct auth table grants.
    await del(sql`select public.fb14_delete_auth_rows(${id}::uuid)`);

    await tx
      .update(accountDeletionRequests)
      .set({ relationalDeletedAt: new Date() })
      .where(eq(accountDeletionRequests.accountId, id));

    return { statusToken: request.statusToken, duplicate: false, completed: false, status: "cleanup_pending" };
  });
}

export type PublicDeletionStatus = {
  status: "cleanup_pending" | "completed" | "cleanup_failed";
  requestedAt: string | null;
  completedAt: string | null;
};

export async function getPublicDeletionStatus(token: string): Promise<PublicDeletionStatus | null> {
  if (!UUID_RE.test(token)) return null;
  const result = await db.execute<{ status: PublicDeletionStatus | null }>(
    sql`select public.fb14_deletion_status(${token}::uuid) as status`
  );
  return result.rows[0]?.status ?? null;
}
