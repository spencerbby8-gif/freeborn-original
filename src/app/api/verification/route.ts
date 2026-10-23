import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, userProfiles, verificationRequests } from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const MAX_SELFIE_BYTES = 6 * 1024 * 1024; // 6 MB
const NEW_ACCOUNT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Preview-room review queue completes automatically after this delay. */
const PREVIEW_AUTO_REVIEW_MS = 60 * 1000;

/* --- In-memory rate limiting (per account) --------------------------------- */

const submitLog = new Map<string, number[]>();

function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (submitLog.get(accountId) ?? []).filter((t) => now - t < windowMs);
  submitLog.set(accountId, hits);
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

/**
 * GET /api/verification
 * Returns the member's verification status, whether the verify prompt should
 * be shown (new, unverified accounts), and the account age. In the preview
 * room, pending requests are auto-approved after ~60s so the full loop can be
 * experienced; production would route these to a human moderation queue.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [account] = await db
    .select({ createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.id, member.id))
    .limit(1);

  const accountAgeMs = account
    ? Math.max(0, Date.now() - account.createdAt.getTime())
    : 0;

  const [latest] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.accountId, member.id))
    .orderBy(desc(verificationRequests.submittedAt))
    .limit(1);

  let status = latest?.status ?? "none";
  let submittedAt = latest?.submittedAt ?? null;

  // Preview-room auto-review (LOCAL DEV ONLY): approve stale pending requests
  // and light up the teal seal. Never in production — there, "pending" means a
  // human reviews it. This gate closes the bypass where any pending request
  // was auto-approved after 60s in production.
  if (
    process.env.NODE_ENV !== "production" &&
    latest &&
    latest.status === "pending" &&
    Date.now() - latest.submittedAt.getTime() > PREVIEW_AUTO_REVIEW_MS
  ) {
    await db
      .update(verificationRequests)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(eq(verificationRequests.id, latest.id));
    await db
      .update(userProfiles)
      .set({ isVerified: true })
      .where(eq(userProfiles.id, member.id));
    status = "approved";
  }

  const profile = await getLocalProfile(member.id);

  return Response.json({
    status,
    submittedAt,
    verified: profile?.isVerified ?? false,
    accountAgeMs,
    required: status !== "approved" && accountAgeMs < NEW_ACCOUNT_WINDOW_MS,
  });
}

/**
 * POST /api/verification
 * Submits a live selfie for identity review. Strict server-side validation:
 * image-only data URLs, size cap, rate limit (3 per hour), one open request
 * at a time.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data } = (body ?? {}) as { data?: string };
  if (!data || !/^data:image\/(jpeg|png|webp);base64,/.test(data)) {
    return Response.json(
      { error: "A live selfie photo is required (JPEG, PNG or WebP)." },
      { status: 400 }
    );
  }

  const base64 = data.slice(data.indexOf(",") + 1);
  if (Buffer.byteLength(base64, "base64") > MAX_SELFIE_BYTES) {
    return Response.json({ error: "Selfie is too large (max 6 MB)." }, { status: 400 });
  }

  if (rateLimited(member.id, 3, 60 * 60 * 1000)) {
    return Response.json(
      { error: "Too many verification attempts. Try again in an hour." },
      { status: 429 }
    );
  }

  const [open] = await db
    .select({ id: verificationRequests.id })
    .from(verificationRequests)
    .where(eq(verificationRequests.accountId, member.id))
    .orderBy(desc(verificationRequests.submittedAt))
    .limit(1);
  if (open && (await currentStatus(open.id)) === "pending") {
    return Response.json(
      { error: "A verification is already in review." },
      { status: 409 }
    );
  }

  /* Privacy Policy clause 7. The 409 guard above only inspects the most recent
     row, so an older undecided attempt can still be holding a photograph.
     Release those images before storing this one, so at most one undecided
     selfie per member exists at any time. Verdicts and reasons are kept. */
  await db
    .update(verificationRequests)
    .set({ selfieMedia: null })
    .where(
      and(
        eq(verificationRequests.accountId, member.id),
        eq(verificationRequests.status, "pending")
      )
    );

  await db.insert(verificationRequests).values({
    accountId: member.id,
    status: "pending",
    method: "selfie",
    selfieMedia: data,
  });

  return Response.json({ ok: true, status: "pending" });
}

async function currentStatus(id: string) {
  const [row] = await db
    .select({ status: verificationRequests.status })
    .from(verificationRequests)
    .where(eq(verificationRequests.id, id))
    .limit(1);
  return row?.status ?? null;
}
