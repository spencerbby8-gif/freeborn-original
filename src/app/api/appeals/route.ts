import { and, desc, eq, sql } from "drizzle-orm";
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
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { detail } = (body ?? {}) as { detail?: string };
  const plea = (detail ?? "").trim();
  if (plea.length < 10) {
    return Response.json({ error: "Tell us what happened. At least a sentence." }, { status: 400 });
  }
  if (plea.length > 2000) {
    return Response.json({ error: "Keep it under 2,000 characters." }, { status: 400 });
  }

  const email = member.email.toLowerCase();

  const [suspension] = await db
    .select()
    .from(suspensions)
    .where(eq(suspensions.email, email))
    .orderBy(desc(suspensions.createdAt))
    .limit(1);
  if (!suspension?.active) {
    return Response.json({ error: "This account isn't suspended." }, { status: 400 });
  }

  const [pending] = await db
    .select()
    .from(appeals)
    .where(eq(appeals.email, email))
    .orderBy(desc(appeals.createdAt))
    .limit(1);
  if (pending && pending.status === "under_review") {
    /* The message used to promise "results in 2 days". Nothing in the product
       enforces or even measures that: an appeal is recorded and an investigation
       summary is written, but no code path lifts a suspension, so a deadline we
       cannot meet is a promise we should not make. Terms clause 6 now says the
       same thing plainly. */
    return Response.json(
      { error: "An appeal is already under review. We will be in touch." },
      { status: 409 }
    );
  }

  /* HUMAN CHALLENGE ON THE APPEAL PATH.
     Tinder stores an Arkose token specifically for the appeal
     (`appealChallengeToken`, set by its own redux action and sent with
     POST /v1/banned-user/appeals). The abuse of a moderation queue is flooding it with
     pleas, which is not the same threat as account takeover and therefore needs its own
     gate. Freeborn has no third-party captcha provider, so this is the seam: a locally
     verifiable proof of work, consumed once, with enforcement behind
     FREEBORN_HUMAN_CHALLENGE so the state is never ambiguous.
       record  (default) — a missing challenge is logged, the appeal still files.
       enforce           — a required challenge must be solved first (HTTP 428). */
  let challenge: { required: boolean; provided: boolean; enforced: boolean } | null = null;
  try {
    const [prior] = await db
      .select({ n: sql<number>`count(*)::int`, last: sql<string>`max(created_at)::text` })
      .from(appeals)
      .where(eq(appeals.email, email));
    const lastAt = prior?.last ? new Date(prior.last).getTime() : null;
    const required = appealNeedsChallenge({
      priorAppeals: Number(prior?.n ?? 0),
      reopenedWithinDays: lastAt ? (Date.now() - lastAt) / 86_400_000 : null,
    });
    const provided = typeof (body as { challengeToken?: unknown })?.challengeToken === "string";
    let solved = false;
    if (provided) {
      const token = (body as { challengeToken: string }).challengeToken;
      if (/^[0-9a-f-]{36}$/i.test(token)) {
        const [row] = await db
          .select({ id: humanChallenges.id })
          .from(humanChallenges)
          .where(
            and(
              eq(humanChallenges.id, token),
              eq(humanChallenges.email, email),
              eq(humanChallenges.purpose, "appeal"),
              eq(humanChallenges.status, "solved")
            )
          )
          .limit(1);
        solved = Boolean(row);
        if (row) {
          // Consume it: a solved row may authorise exactly one appeal.
          await db
            .update(humanChallenges)
            .set({ status: "failed" })
            .where(and(eq(humanChallenges.id, token), eq(humanChallenges.status, "solved")));
        }
      }
    }
    const enforced = process.env.FREEBORN_HUMAN_CHALLENGE === "enforce";
    challenge = { required, provided, enforced: required && enforced };
    if (required && enforced && !solved) {
      return Response.json(
        { error: "human_challenge_required", next: "/api/human/issue", purpose: "appeal" },
        { status: 428 }
      );
    }
    if (required && !solved) {
      await db.insert(securityEvents).values({
        email,
        kind: "appeal_challenge_not_met",
        detail: `record-only mode: appeal filed without a solved challenge (prior=${Number(prior?.n ?? 0)})`,
      });
    }
  } catch {
    /* a broken challenge bookkeeping path must never block the plea itself */
  }

  const [filed] = await db
    .insert(appeals)
    .values({ email, detail: plea })
    .returning({ id: appeals.id, createdAt: appeals.createdAt });

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
      investigateAppeal(plea, record),
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
    message: "Appeal received. A person reads every appeal. Check back here for the result.",
  });
}
