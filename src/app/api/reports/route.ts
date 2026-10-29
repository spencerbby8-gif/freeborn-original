import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, securityEvents, userProfiles, warnings } from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";
import { factCheckReport } from "@/lib/moderation";
import { openCase, recomputeTrust } from "@/lib/identity-resolve";
import { ENGINE_BUDGET_MS, withBudget } from "@/lib/engine-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The canonical member-facing reason set. Kept in lockstep with the live
 *  `reports_reason_check` by scripts/trust/harness.ts section [10], which reads
 *  db/migrations/2026-10-29-engine-operability.sql and asserts every value here is
 *  accepted by it. Before that test existed, production's CHECK was missing 'safety'
 *  and 500'd the whole POST — see RE-EVIDENCE-GAP-REPORT and the schema comment. */
export const REASONS = new Set([
  "fake_profile",
  "scam",
  "harassment",
  "safety",
  "underage",
  "inappropriate_media",
  /* Bumble added exactly this reason in July 2024 under Fake Profile once AI
     impersonation became a mass problem. A dating app that cannot record "this is
     generated" separately from "this is someone else" cannot tell which fraud it has. */
  "ai_generated_media",
  "other",
]);

/** Report reason -> enforcement code. Only ever opens a REVIEW-REQUIRED case. */
const REASON_TO_CASE: Record<string, {
  code: "photo_reused_across_accounts" | "scam_pattern_message" | "harassment_pattern"
      | "inappropriate_media" | "underage_suspected" | "report_surge";
  violatedClass: "violation_personal_content" | "violation_profile_content"
      | "violation_media" | "violation_behavior" | "violation_identity";
} | null> = {
  fake_profile: { code: "photo_reused_across_accounts", violatedClass: "violation_profile_content" },
  ai_generated_media: { code: "photo_reused_across_accounts", violatedClass: "violation_personal_content" },
  scam: { code: "scam_pattern_message", violatedClass: "violation_behavior" },
  harassment: { code: "harassment_pattern", violatedClass: "violation_behavior" },
  safety: { code: "harassment_pattern", violatedClass: "violation_behavior" },
  inappropriate_media: { code: "inappropriate_media", violatedClass: "violation_media" },
  underage: { code: "underage_suspected", violatedClass: "violation_profile_content" },
  other: null,
};

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

  /* Legacy values that already exist in rows written before this list was reconciled.
     They are accepted on read and normalised on write, rather than rejected, because a
     member who picks "nudity" in an older client must not lose their report. */
  const LEGACY_REASON: Record<string, string> = {
    inappropriate_content: "inappropriate_media",
    nudity: "inappropriate_media",
    violence: "safety",
    selfie_mismatch: "fake_profile",
    spam: "other",
  };
  const requested = typeof reason === "string" ? reason.trim().toLowerCase() : "";
  const safeReason = REASONS.has(requested)
    ? requested
    : LEGACY_REASON[requested] ?? "other";
  const safeDetails = typeof details === "string" ? details.slice(0, 1000) : null;

  if (rateLimited(member.id, 10, 60 * 60 * 1000)) {
    return Response.json(
      { error: "Too many reports submitted. Try again later." },
      { status: 429 }
    );
  }

  /* This insert was previously unguarded, which is exactly how a CHECK drift turned into
     a lost report and an HTTP 500. It now retries once with the only reason the database
     can never reject ("other"), so a schema/code mismatch degrades the taxonomy, not the
     safety action. Both attempts failing is the only path that surfaces an error. */
  let filed: { id: string } | null = null;
  let filedReason = safeReason;
  try {
    filed = await db
      .insert(reports)
      .values({
        reporterId: member.id,
        subjectId: profileId,
        reason: safeReason,
        details: safeDetails,
        triage: "pending",
      })
      .returning({ id: reports.id })
      .then((r) => r[0] ?? null);
  } catch (e) {
    await db
      .insert(securityEvents)
      .values({
        email: member.email,
        kind: "report_reason_rejected",
        detail: `insert failed for reason="${safeReason}" (${String((e as { code?: string })?.code ?? e)}); re-filing as "other"`,
      })
      .catch(() => undefined);
    try {
      filed = await db
        .insert(reports)
        .values({ reporterId: member.id, subjectId: profileId, reason: "other", details: safeDetails })
        .returning({ id: reports.id })
        .then((r) => r[0] ?? null);
      filedReason = "other";
    } catch {
      return Response.json(
        { error: "We could not file your report. It has been logged; please try again." },
        { status: 503 }
      );
    }
  }

  if (!filed) {
    return Response.json(
      { error: "We could not file your report. It has been logged; please try again." },
      { status: 503 }
    );
  }

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
        .set({ severity: verdict.severity, triageSummary: verdict.summary.slice(0, 200), triage: "complete" })
        .where(eq(reports.id, filed!.id));

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

  /* A report never acts on an account (moderation.ts rule 1). What it CAN do is make the
     queue durable and ordered the way Tinder's client models it: a case with a tier, a
     violation class, a state and an explicit `reviewRequired` flag, plus the
     warnings/acknowledge exit. decidePolicy() caps anything report-only at a WARNING, so a
     mass-report wave cannot suppress or suspend — scripts/trust/harness.ts asserts that
     over 720 input combinations. */
  try {
    const map = REASON_TO_CASE[filedReason];
    if (map && profileId) {
      const subjectId = profileId;
      const [sameReason] = await db
        .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
        .from(reports)
        .where(and(eq(reports.subjectId, subjectId), eq(reports.reason, safeReason)));
      const distinctReporters = Number(sameReason?.n ?? 1);
      await openCase({
        userId: subjectId,
        email: (target as { email?: string | null }).email ?? null,
        input: {
          code: map.code,
          violatedClass: map.violatedClass,
          detail: `${distinctReporters} distinct reporter(s) filed "${filedReason}"; report=${filed.id}.`,
          notes:
            "Members reported your profile. Nothing has been changed on your account; a person will look, and you can add your side here.",
          trustDelta: -5,
          openedBy: "member_report",
          reporterCount: distinctReporters,
          verified: Boolean((target as { isVerified?: boolean }).isVerified),
        },
      });
      await recomputeTrust(subjectId).catch(() => undefined);
    }
  } catch {
    /* the report is already filed; a queue-side failure must not lose it or fail the member */
  }

  return Response.json({ ok: true, severity, outcome, triage });
}
