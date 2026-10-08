import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appeals, securityEvents, suspensions } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { investigateAppeal } from "@/lib/moderation";

export const dynamic = "force-dynamic";

const REVIEW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // results in 2 days

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
 * POST /api/appeals — file an appeal. A deep investigation runs immediately
 * (security record + dual-model bot analysis), the member is told to return
 * in 2 days, and the investigation result is stored for the final decision.
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
    return Response.json({ error: "Tell us what happened — at least a sentence." }, { status: 400 });
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
    return Response.json({ error: "An appeal is already under review — results in 2 days." }, { status: 409 });
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
    const result = await investigateAppeal(plea, record);
    investigation = result ? `botRisk=${result.botRisk} :: ${result.summary}` : "engines unavailable — human review only";
    await db
      .update(appeals)
      .set({ investigation: investigation.slice(0, 900) })
      .where(eq(appeals.id, filed.id));
  } catch {
    /* investigation failure never blocks the appeal */
  }

  return Response.json({
    ok: true,
    dueInDays: 2,
    message: "Appeal received. Our investigators are on it — come back in 2 days for the result.",
  });
}
