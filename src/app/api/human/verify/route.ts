import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { humanChallenges, securityEvents } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { meetsDifficulty } from "@/app/api/human/issue/route";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

/**
 * POST /api/human/verify  { nonce, solution }
 * Consumes a challenge issued by /api/human/issue. Single-use: the row flips to
 * `solved` and a solved row can never be replayed, which is the property an appeal
 * gate actually needs (Tinder's stored `appealChallengeToken` is likewise consumed by
 * the appeal POST rather than re-presented).
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { nonce, solution } = (body ?? {}) as { nonce?: unknown; solution?: unknown };
  if (typeof nonce !== "string" || typeof solution !== "string") {
    return Response.json({ error: "nonce and solution are required." }, { status: 400 });
  }
  if (!/^[0-9a-f]{32}$/.test(nonce) || solution.length > 512) {
    return Response.json({ error: "Unusable challenge." }, { status: 400 });
  }

  const email = member.email.toLowerCase();
  const [row] = await db
    .select()
    .from(humanChallenges)
    .where(
      and(
        eq(humanChallenges.email, email),
        eq(humanChallenges.nonce, nonce),
        inArray(humanChallenges.status, ["issued", "failed"])
      )
    )
    .orderBy(desc(humanChallenges.issuedAt))
    .limit(1);

  if (!row) {
    await db.insert(securityEvents).values({ email, kind: "human_challenge_missing", detail: `purpose-lookup failed for ${nonce.slice(0, 8)}…` });
    return Response.json({ ok: false, error: "no-live-challenge" }, { status: 410 });
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.update(humanChallenges).set({ status: "expired" }).where(eq(humanChallenges.id, row.id));
    return Response.json({ ok: false, error: "expired" }, { status: 408 });
  }

  const ok = meetsDifficulty(nonce, solution, row.difficultyBits ?? 18);
  if (!ok) {
    const attempts = row.attempts + 1;
    await db
      .update(humanChallenges)
      .set({ attempts, status: attempts >= MAX_ATTEMPTS ? "failed" : "issued" })
      .where(eq(humanChallenges.id, row.id));
    await db.insert(securityEvents).values({ email, kind: "human_challenge_failed", detail: `attempts=${attempts}` });
    return Response.json(
      { ok: false, error: attempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong-solution", attempts },
      { status: 400 }
    );
  }

  await db
    .update(humanChallenges)
    .set({ status: "solved", solvedAt: sql`timezone('utc', now())`, attempts: row.attempts + 1 })
    .where(eq(humanChallenges.id, row.id));

  return Response.json(
    { ok: true, token: row.id, purpose: row.purpose, enforcing: process.env.FREEBORN_HUMAN_CHALLENGE === "enforce" },
    { headers: { "cache-control": "private, no-store" } }
  );
}
