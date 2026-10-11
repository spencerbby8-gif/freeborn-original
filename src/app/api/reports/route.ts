import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, userProfiles, warnings } from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";
import { factCheckReport } from "@/lib/moderation";
import { ENGINE_BUDGET_MS, withBudget } from "@/lib/engine-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const [filed] = await db
    .insert(reports)
    .values({
      reporterId: member.id,
      subjectId: profileId,
      reason: safeReason,
      details: safeDetails,
    })
    .returning({ id: reports.id });

  /* DUAL-MODEL FACT CHECK — two independent engines judge observable
     evidence only (never private chats). Reports alone never ban anyone;
     the outcome is dismiss / warn / escalate-for-hard-evidence. */
  let severity: string | null = null;
  let outcome: string | null = null;
  let triage: "complete" | "pending" = "pending";
  try {
    const [{ count: priorReports }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.subjectId, profileId));

    const targetSummary = [
      target.displayName ?? "no name",
      target.city ?? "no city",
      target.bio ?? "no bio",
      `joined ${target.createdAt?.toISOString?.() ?? "unknown"}`,
      target.isVerified ? "IDENTITY VERIFIED" : "not identity-verified",
    ].join(" · ");

    /* Engine budget: a hanging gateway must never 502 a filed report —
       the report row is already stored; triage degrades to human review. */
    const verdict = await withBudget(
      factCheckReport(
        safeReason,
        safeDetails ?? "",
        targetSummary,
        priorReports,
        Boolean(target.isVerified)
      ),
      ENGINE_BUDGET_MS,
      () => null
    );

    if (verdict) {
      triage = "complete";
      severity = verdict.severity;
      outcome = verdict.action;
      await db
        .update(reports)
        .set({ severity: verdict.severity, triageSummary: verdict.summary.slice(0, 200) })
        .where(eq(reports.id, filed.id));

      /* A warning is issued only when BOTH models find the claim credible
         and serious — and never against verified members on one engine. */
      if (verdict.action === "warn") {
        await db.insert(warnings).values({
          email: (target.email ?? "").toLowerCase(),
          kind: "behavior-report",
          detail: `${safeReason}: ${verdict.summary.slice(0, 160)}`,
        });
      }
    }
  } catch {
    /* justice-engine outage never stops a report */
  }

  return Response.json({ ok: true, severity, outcome, triage });
}
