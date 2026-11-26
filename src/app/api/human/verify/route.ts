import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
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
        eq(humanChallenges.status, "issued"),
        lt(humanChallenges.attempts, MAX_ATTEMPTS)
      )
    )
    .orderBy(desc(humanChallenges.issuedAt))
    .limit(1);

  if (!row) {
    await db.insert(securityEvents).values({ email, kind: "human_challenge_missing", detail: `purpose-lookup failed for ${nonce.slice(0, 8)}…` });
    return Response.json({ ok: false, error: "no-live-challenge" }, { status: 410 });
  }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await db.update(humanChallenges).set({ status: "expired" }).where(and(eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued")));
    return Response.json({ ok: false, error: "expired" }, { status: 408 });
  }

  const ok = meetsDifficulty(nonce, solution, row.difficultyBits ?? 18);
  // Atomic compare-and-update: racing verifications cannot resurrect consumed,
  // failed or expired challenges, nor count more than MAX_ATTEMPTS guesses.
  const [updated] = await db.update(humanChallenges)
    .set(ok
      ? { status: "solved", solvedAt: sql`timezone('utc', now())`, attempts: sql`${humanChallenges.attempts} + 1` }
      : { status: sql`case when ${humanChallenges.attempts} + 1 >= ${MAX_ATTEMPTS} then 'failed' else 'issued' end`, attempts: sql`${humanChallenges.attempts} + 1` })
    .where(and(eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued"),
      lt(humanChallenges.attempts, MAX_ATTEMPTS), gt(humanChallenges.expiresAt, sql`clock_timestamp()`)))
    .returning({ id: humanChallenges.id, attempts: humanChallenges.attempts });
  if (!updated) return Response.json({ ok: false, error: "no-live-challenge" }, { status: 410 });
  if (!ok) {
    await db.insert(securityEvents).values({ email, kind: "human_challenge_failed", detail: `attempts=${updated.attempts}` });
    return Response.json(
      { ok: false, error: updated.attempts >= MAX_ATTEMPTS ? "too-many-attempts" : "wrong-solution", attempts: updated.attempts },
      { status: 400 }
    );
  }

  return Response.json(
    { ok: true, token: row.id, purpose: row.purpose, enforcing: process.env.FREEBORN_HUMAN_CHALLENGE === "enforce" },
    { headers: { "cache-control": "private, no-store" } }
  );
}
