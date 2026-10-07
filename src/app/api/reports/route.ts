import { db } from "@/db";
import { reports } from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const REASONS = new Set([
  "fake_profile",
  "scam",
  "harassment",
  "safety",
  "underage",
  "inappropriate_media",
  "other",
]);

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
 * POST /api/reports
 * Files a member report into the moderation queue. Validated reasons,
 * capped details, rate-limited to 10 reports per hour per account.
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

  const { profileId, reason, details } = (body ?? {}) as {
    profileId?: string;
    reason?: string;
    details?: string;
  };

  if (!profileId) {
    return Response.json({ error: "A profile id is required." }, { status: 400 });
  }
  const target = await getLocalProfile(profileId);
  if (!target) return Response.json({ error: "Profile not found." }, { status: 404 });
  if (profileId === member.id) {
    return Response.json({ error: "You can't report your own profile." }, { status: 400 });
  }

  const safeReason = reason && REASONS.has(reason) ? reason : "other";
  const safeDetails = typeof details === "string" ? details.slice(0, 1000) : null;

  if (rateLimited(member.id, 10, 60 * 60 * 1000)) {
    return Response.json(
      { error: "Too many reports submitted. Try again later." },
      { status: 429 }
    );
  }

  await db.insert(reports).values({
    reporterId: member.id,
    subjectId: profileId,
    reason: safeReason,
    details: safeDetails,
  });

  return Response.json({ ok: true });
}
