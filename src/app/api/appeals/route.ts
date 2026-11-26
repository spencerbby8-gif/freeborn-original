import { rejectCrossOrigin } from "@/lib/request-guard";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appeals, humanChallenges, securityEvents, suspensions } from "@/db/schema";
import { appealNeedsChallenge } from "@/lib/moderation-policy";
import { getMember } from "@/lib/app-auth";
import { investigateAppeal } from "@/lib/moderation";
import { ENGINE_BUDGET_MS, withBudget } from "@/lib/engine-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* An internal target for how long an appeal should take, used only to compute
   the `dueAt` and `ready` fields on the GET response. It is NOT shown to the
   member as a promised date, and nothing in the product enforces it: no code
   path ever writes appeals.verdict or sets suspensions.active to false, so a
   decision is a manual act by the operator. Presenting this window to members
   as a deadline would promise something the system cannot deliver. */
const REVIEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Latest appeal status for the signed-in member. */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const [latest] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.email, member.email.toLowerCase()))
    .orderBy(desc(appeals.createdAt))
    .limit(1);

  if (!latest) return Response.json({ appeal: null });

  const dueAt = latest.createdAt.getTime() + REVIEW_WINDOW_MS;
  return Response.json({
    appeal: {
      status: latest.status,
      verdict: latest.verdict,
      createdAt: latest.createdAt,
      dueAt: new Date(dueAt).toISOString(),
      ready: Date.now() >= dueAt,
    },
  });
}

/**
 * POST /api/appeals: file an appeal. The security record is gathered and, when
 * the engines are available, a dual-model bot analysis runs with it. The result
 * is stored for the operator to read. No deadline is promised to the member and
 * no code path lifts a suspension: reinstatement is a manual act.
 */
export async function POST(request: Request) {
  const crossOrigin=rejectCrossOrigin(request);if(crossOrigin)return crossOrigin;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  const plea = typeof detail === "string" ? detail.trim() : "";
  if (plea.length < 10) {
    return Response.json({ error: "Tell us what happened. At least a sentence." }, { status: 400 });
  }
  if (plea.length > 2000) {
    return Response.json({ error: "Keep it under 2,000 characters." }, { status: 400 });
  }

  const email = member.email.toLowerCase();

  // One transaction per email serializes pending checks, challenge consumption
  // and filing. This lock is only a boundary for this route; external operator
  // workflows do not yet participate and cannot be claimed linearizable.
  let filing;
  try {
    filing = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('appeal:' || ${email}::text, 0))`);
      const [suspension] = await tx.select().from(suspensions)
        .where(eq(suspensions.email, email)).orderBy(desc(suspensions.createdAt)).limit(1);
      if (!suspension?.active) return { response: Response.json({ error: "This account isn't suspended." }, { status: 400 }) };

      const [pending] = await tx.select({ id: appeals.id }).from(appeals)
        .where(and(eq(appeals.email, email), eq(appeals.status, "under_review"))).limit(1);
      if (pending) return { response: Response.json({ error: "An appeal is already under review. Check back for a recorded update." }, { status: 409 }) };

      const [prior] = await tx.select({ n: sql<number>`count(*)::int`, last: sql<string>`max(created_at)::text` })
        .from(appeals).where(eq(appeals.email, email));
      const lastAt = prior?.last ? new Date(prior.last).getTime() : null;
      const required = appealNeedsChallenge({ priorAppeals: Number(prior?.n ?? 0), reopenedWithinDays: lastAt ? (Date.now() - lastAt) / 86_400_000 : null });
      const token = (body as { challengeToken?: unknown } | null)?.challengeToken;
      let solved = false;
      if (typeof token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        // 'expired' is terminal to the verify endpoint; a consumed solution
        // cannot be re-solved. A conditional UPDATE is the claim operation.
        const consumed = await tx.update(humanChallenges).set({ status: "expired" })
          .where(and(eq(humanChallenges.id, token), eq(humanChallenges.email, email),
            eq(humanChallenges.purpose, "appeal"), eq(humanChallenges.status, "solved"), gt(humanChallenges.expiresAt, sql`clock_timestamp()`)))
          .returning({ id: humanChallenges.id });
        solved = consumed.length === 1;
      }
      if (required && process.env.FREEBORN_HUMAN_CHALLENGE === "enforce" && !solved) {
        return { response: Response.json({ error: "human_challenge_required", next: "/api/human/issue", purpose: "appeal" }, { status: 428 }) };
      }
      if (required && !solved) {
        await tx.insert(securityEvents).values({ email, kind: "appeal_challenge_not_met", detail: `record-only mode: appeal filed without a solved challenge (prior=${Number(prior?.n ?? 0)})` });
      }
      const [filed] = await tx.insert(appeals).values({ email, detail: plea }).returning({ id: appeals.id, createdAt: appeals.createdAt });
      return { filed, suspension };
    });
  } catch {
    // Fail truthfully rather than bypassing enforced challenge bookkeeping or
    // claiming a submission that may not have committed.
    return Response.json({ error: "We couldn't confirm your appeal was submitted. Check its status before trying again." }, { status: 503 });
  }
  if (filing.response) return filing.response;
  const { filed, suspension } = filing;
  if (!filed || !suspension) return Response.json({ error: "We couldn't confirm your appeal was submitted. Check its status before trying again." }, { status: 503 });

  /* Deep investigation — immediate, stored, never auto-bans or auto-clears. */
  let investigation = "no record collected";
  try {
    const events = await db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.email, email))
      .orderBy(desc(securityEvents.createdAt));
    const record = [
      `suspension reason: ${suspension.reason}`,
      `suspension ip: ${suspension.ip ?? "unknown"}`,
      ...events.slice(0, 12).map((e) => `${e.kind}${e.detail ? ` — ${e.detail}` : ""} (${e.ip ?? "no ip"})`),
    ].join("; ");
    /* Engine budget: the appeal is already stored — a hanging gateway
       degrades the investigation to human review, never a 502. */
    const result = await withBudget(
      (signal) => investigateAppeal(plea, record, signal),
      ENGINE_BUDGET_MS,
      () => null
    );
    investigation = result
      ? `botRisk=${result.botRisk} :: ${result.summary}`
      : "investigation pending: engine budget exhausted";
    await db
      .update(appeals)
      .set({ investigation: investigation.slice(0, 900) })
      .where(eq(appeals.id, filed.id));
  } catch {
    /* investigation failure never blocks the appeal */
  }

  return Response.json({
    ok: true,
    message: "Appeal received for review. Check back for a recorded update.",
  });
}
