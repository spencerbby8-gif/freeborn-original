import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appeals, enforcementCases, reports, userProfiles, userTrustHistory } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/review-queue  — READ-ONLY operator queue.
 *
 * WHY READ-ONLY, and why that is not laziness: REVIEW-SURFACE-DESIGN.md §2 records the
 * decision not to build an admin write panel, because Freeborn has no admin identity
 * model and the fastest way to invent one is a shared token — which is precisely the
 * mistake that produced Unject's two breaches (an unauthenticated dashboard exposing
 * ~3,500 members in 2022, and DMs/locations in 2024). This project's operator already
 * has a stronger authenticated path to the same data: their Supabase account. So the
 * write path stays a runbook of one-transaction SQL that records its own
 * `moderation_actions` row, and this route only answers the question the runbook cannot
 * answer quickly: *what is in the queue, and in what order should a human read it?*
 *
 * Nothing here can change a member's account. It reads, and it redacts.
 *
 * Access: same posture as /api/health/engines — production is allowlist-gated by
 * FREEBORN_ADMIN_EMAILS and fails closed to a bare 404 when the list is empty (so a
 * missing configuration cannot turn into an open queue); non-production is open so a
 * reviewer can measure it before shipping. RLS gives no extra protection here and is not
 * relied on: the app connects as `postgres`, which bypasses RLS, so this route's own
 * authentication is the whole control. That is stated in the design doc too, and it is
 * the reason this route returns no contact details and no message content.
 */

import { queuePriority } from "@/lib/review-queue-priority";

function redact(s: string | null, n: number) {
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** FNV-1a, 32-bit, hex. For log diagnostics only: short enough to be non-reversible in
 *  practice, stable enough to compare two strings without either one being written down.
 *  Pure: no clock, no randomness, no I/O. */
function gateTrace(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export async function GET(request: Request) {
  const allowlist = (process.env.FREEBORN_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === "production";
  /* Fail closed with NO environment qualifier. The old guard was `isProduction && ...`, so a
       deployment running with NODE_ENV=development (or `vercel dev`, which reads the project's
       Development environment variables) and an unset FREEBORN_ADMIN_EMAILS served the whole
       review queue - reports, cases, appeals, trust history - to ANY signed-in member. Verified
       on 2026-10-30 that the Vercel project's Development target does not carry
       FREEBORN_ADMIN_EMAILS (it is assigned to Production and Preview only), which made that
       combination live rather than theoretical. */
  /* An empty allowlist stays a bare one-line fail-closed return, unqualified by environment. The
     harness pins this exact shape (scripts/trust/harness.ts, "[11] the queue is gated fail-closed
     in EVERY environment") precisely so that nobody reintroduces the `isProduction &&` guard that
     once served the whole queue to any signed-in member on a preview. The diagnostic is a separate
     statement so the pinned line is never edited into something softer. */
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  if (allowlist.length === 0) console.warn(`admin-review-queue: fail-closed, FREEBORN_ADMIN_EMAILS empty (env=${env})`);
  if (allowlist.length === 0) return new Response("Not found", { status: 404 });
  const member = await getMember(request);
  if (!member) {
    /* Anonymous callers keep the indistinguishable 404 — they learn nothing about whether the
       route exists, which is the entire point of the fail-closed posture. */
    return isProduction
      ? new Response("Not found", { status: 404 })
      : Response.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!allowlist.includes(member.email.toLowerCase())) {
    /* Authentication already succeeded on this branch: the caller is a signed-in member who is
       simply not an operator. A 403 here, instead of the old bare 404, is what makes "the admin
       route is broken" separable from "your address is not on the list" — which is the exact
       ambiguity that cost an operator a production investigation on 2026-10-30. No queue data is
       returned, and not one check was relaxed or reordered. The detail goes to the runtime log;
       the body stays a single word.

       `gateTrace` is a non-reversible 32-bit digest used so the operator can match the address
       they are signed in as against the entries they configured without either one landing in a
       shared log. */
    console.warn(
      `admin-review-queue: 403 session=${gateTrace(member.email.toLowerCase())} ` +
        `allowlist_entries=${allowlist.length} allowlist=[${allowlist.map(gateTrace).join(",")}] (env=${env})`
    );
    return Response.json(
      { error: "Not authorized." },
      { status: 403, headers: { "cache-control": "private, no-store" } }
    );
  }

  const [openReports, cases, appealsRows, trustRows] = await Promise.all([
    db
      .select({
        id: reports.id,
        createdAt: reports.createdAt,
        reason: reports.reason,
        status: reports.status,
        origin: reports.origin,
        severity: reports.severity,
        triage: reports.triage,
        subjectId: reports.subjectId,
        details: reports.details,
        triageSummary: reports.triageSummary,
        subjectName: userProfiles.displayName,
        subjectVerified: userProfiles.isVerified,
      })
      .from(reports)
      .leftJoin(userProfiles, eq(userProfiles.id, reports.subjectId))
      .where(eq(reports.status, "open"))
      .orderBy(desc(reports.createdAt))
      .limit(200),
    db
      .select({
        id: enforcementCases.id,
        userId: enforcementCases.userId,
        tier: enforcementCases.tier,
        state: enforcementCases.state,
        code: enforcementCases.code,
        violatedClass: enforcementCases.violatedClass,
        detail: enforcementCases.detail,
        trustDelta: enforcementCases.trustDelta,
        openedBy: enforcementCases.openedBy,
        createdAt: enforcementCases.createdAt,
      })
      .from(enforcementCases)
      .where(sql`${enforcementCases.state} <> 'resolved'`)
      .orderBy(desc(enforcementCases.createdAt))
      .limit(200),
    db
      .select({
        id: appeals.id,
        email: appeals.email,
        status: appeals.status,
        detail: appeals.detail,
        verdict: appeals.verdict,
        createdAt: appeals.createdAt,
      })
      .from(appeals)
      .where(eq(appeals.status, "under_review"))
      .orderBy(desc(appeals.createdAt))
      .limit(100),
    db
      .select({
        userId: userTrustHistory.userId,
        trustScore: userTrustHistory.trustScore,
        duplicatePhotoHits: userTrustHistory.duplicatePhotoHits,
        mismatchHistoryCount: userTrustHistory.mismatchHistoryCount,
      })
      .from(userTrustHistory)
      .limit(2000),
  ]);

  const trustByUser = new Map(trustRows.map((t) => [t.userId, t]));
  const openCasesByUser = new Map<string, number>();
  for (const c of cases) openCasesByUser.set(c.userId, (openCasesByUser.get(c.userId) ?? 0) + 1);

  const now = Date.now();
  const rows = openReports.map((r) => {
    const t = r.subjectId ? trustByUser.get(r.subjectId) : undefined;
    const ageHours = Math.max(0, (now - new Date(r.createdAt).getTime()) / 3_600_000);
    const trustScore = t?.trustScore === null || t?.trustScore === undefined ? null : Number(t.trustScore);
    return {
      id: r.id,
      createdAt: r.createdAt,
      reason: r.reason,
      origin: r.origin,
      severity: r.severity,
      /* `triage: null` on an open member report means "no engine verdict exists".
         With the ANTIGRAVITY and VOID_AI keys unset that is every row, and this field is what
         stops an operator from reading an empty queue as a clean queue. */
      triage: r.triage ?? (r.severity ? "complete" : "pending"),
      subject: r.subjectName ?? null,
      subjectVerified: Boolean(r.subjectVerified),
      subjectTrustScore: trustScore,
      subjectDuplicatePhotoHits: t?.duplicatePhotoHits ?? 0,
      subjectMismatches: t?.mismatchHistoryCount ?? 0,
      openCasesForSubject: r.subjectId ? (openCasesByUser.get(r.subjectId) ?? 0) : 0,
      ageHours: Math.round(ageHours),
      details: redact(r.details, 240),
      triageSummary: redact(r.triageSummary, 240),
      priority: queuePriority({
        origin: r.origin,
        triage: r.triage ?? (r.severity ? "complete" : "pending"),
        severity: r.severity,
        trustScore,
        openCases: r.subjectId ? (openCasesByUser.get(r.subjectId) ?? 0) : 0,
        ageHours,
      }),
    };
  });

  rows.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      read_only: true,
      note:
        "No write path exists or will be added here. Decide in the Supabase SQL editor using the runbook in REVIEW-SURFACE-DESIGN.md §4, which records every act in moderation_actions in the same transaction.",
      counts: {
        openReports: openReports.length,
        untriagedMemberReports: rows.filter((r) => r.origin === "member" && r.triage === "pending").length,
        openCases: cases.length,
        appealsUnderReview: appealsRows.length,
      },
      reports: rows,
      cases: cases.map((c) => ({
        id: c.id,
        tier: c.tier,
        state: c.state,
        code: c.code,
        violatedClass: c.violatedClass,
        openedBy: c.openedBy,
        trustDelta: c.trustDelta,
        createdAt: c.createdAt,
        detail: redact(c.detail, 200),
      })),
      /* Appeals are keyed by email and are the one queue where the subject IS the
         requester, so emails are truncated to a hint, never echoed whole. */
      appeals: appealsRows.map((a) => ({
        id: a.id,
        status: a.status,
        verdict: a.verdict,
        createdAt: a.createdAt,
        emailHint: `${String(a.email).slice(0, 2)}***@${String(a.email).split("@")[1] ?? "?"}`,
        detail: redact(a.detail, 240),
      })),
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
