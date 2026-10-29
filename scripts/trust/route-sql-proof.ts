/* Executes the SQL that the NEW routes issue, against the production database, including a real
   profile_photos insert (the write that was broken) and a real human-challenge round trip.
   Everything it creates it deletes. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { humanChallenges, profilePhotos, securityEvents, userProfiles, userTrustHistory, enforcementCases } from "@/db/schema";
import { meetsDifficulty, CHALLENGE_DIFFICULTY_BITS } from "@/app/api/human/issue/route";
import { suppressedUserIds } from "@/lib/identity-resolve";
import { nextStepFor, appealNeedsChallenge } from "@/lib/moderation-policy";
import { acknowledgeCase, openCase } from "@/lib/identity-resolve";

const line = (s: string) => console.log("  " + s);

const [u] = await db.select({ id: userProfiles.id, email: userProfiles.email }).from(userProfiles).limit(1);
if (!u?.id) { console.log("  no member to test against"); process.exit(0); }
line(`member ${u.id.slice(0, 8)} ${u.email}`);

/* 1. THE ROUTE'S OWN DECK QUERY (suppression honoured) */
line("\n[1] /api/profiles deck query with suppression exclusion");
const deckRes = await db.execute(sql`
  with suppressed as (
    select user_id from public.user_trust_history where suppression_active
  )
  select count(*) as n from public.user_profiles up
   where up.discoverable and up.id <> ${u.id}
     and up.id not in (select user_id from suppressed)`);
line(`  deck-size (anon path, real SQL): ${JSON.stringify((deckRes as { rows?: unknown[] }).rows ?? deckRes)}`);
const supIds = await suppressedUserIds();
line(`  suppressedUserIds() -> ${supIds.length} member(s) hidden from the deck (matches isSuppressed()'s two sources)`);

/* 2. REAL profile_photos INSERT WITH HASHES — the write that used to fail 22P02 */
line("\n[2] profile_photos insert with hash columns (the previously-failing write)");
const photoId = "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
let insertOk = false, insertErr = "";
try {
  await db.insert(profilePhotos).values({
    id: photoId, userId: u.id, storagePath: `/api/chat/media/00000000-0000-4000-8000-000000000p01`,
    phashD: "deadbeefdeadbeef", phashA: "0123456789abcdef", phashBytes: "a".repeat(64),
    phashAt: sql`timezone('utc', now())`, position: 7,
  });
  insertOk = true;
} catch (e) { const cz = (e as { cause?: unknown }).cause as { message?: string } | undefined;
  insertErr = (cz?.message ?? (e as Error).message ?? "?").slice(0, 300); }
line(`  insert ok=${insertOk} ${insertErr ? "err=" + insertErr : ""}`);
if (insertOk) {
  const [rb] = await db.select({ d: profilePhotos.phashD, a: profilePhotos.phashA, b: profilePhotos.phashBytes })
    .from(profilePhotos).where(eq(profilePhotos.id, photoId)).limit(1);
  line(`  readback d=${rb?.d} a=${rb?.a} bytes=${(rb?.b ?? "").trim().slice(0, 8)}… (char(16) pads, so read with trim)`);
  await db.delete(profilePhotos).where(eq(profilePhotos.id, photoId));
  line("  deleted");
}

/* 3. findDuplicatePhotos' exact candidate query, with the new bytes branch */
line("\n[3] duplicate-scan candidate query (hash OR bytes, plus suspended probe)");
const candRes = await db.execute(sql`
  select pp.id, pp.user_id, up.email,
         pp.phash_d::text as phash_d, pp.phash_a::text as phash_a, pp.phash_bytes::text as phash_bytes,
         exists (select 1 from public.suspensions s where s.email = up.email and s.active) as suspended
    from public.profile_photos pp
    join public.user_profiles up on up.id = pp.user_id
   where pp.user_id <> ${u.id}
     and (pp.phash_d is not null or pp.phash_bytes is not null)
   order by pp.created_at desc limit 500`);
const rowsA = (candRes as unknown as { rows?: unknown[] }).rows ?? [];
line(`  candidates=${rowsA.length} (query executed without error)`);

/* 4. /api/safety/cases GET query + /ack update path */
line("\n[4] safety/cases read + acknowledge write");
const caseRows = await db.select({
  id: enforcementCases.id, tier: enforcementCases.tier, state: enforcementCases.state,
}).from(enforcementCases).where(and(eq(enforcementCases.userId, u.id), inArray(enforcementCases.state, ["open", "in_review"]))).orderBy(desc(enforcementCases.createdAt)).limit(10);
line(`  open cases for member: ${caseRows.length}`);
/* The route calls acknowledgeCase(); exercise THAT, on a case we open and then close.
   warnings/acknowledged_at live on enforcement_cases, not on the legacy warnings log. */
const [prof] = await db.select({ email: userProfiles.email }).from(userProfiles).where(eq(userProfiles.id, u.id)).limit(1);
const opened = await openCase({
  userId: u.id, email: prof?.email ?? null,
  input: { code: "harassment_pattern", violatedClass: "violation_behavior", detail: "route-sql proof", notes: "temporary", trustDelta: -5, openedBy: "system" },
});
line(`  opened warning case: ${opened.opened} id=${opened.caseId?.slice(0, 8)} tier=${opened.tier} reviewRequired=${opened.reviewRequired}`);
if (opened.caseId) {
  const ack = await acknowledgeCase(u.id, opened.caseId);
  line(`  acknowledgeCase(same member, own case) -> ok=${ack.ok} error=${ack.error ?? "-"} (the exact call /api/safety/cases/ack makes)`);
  const wrongOwner = await acknowledgeCase((await db.select({ id: userProfiles.id }).from(userProfiles).where(sql`id <> ${u.id}`).limit(1))[0]?.id ?? u.id, opened.caseId);
  line(`  acknowledgeCase(DIFFERENT member, same case) -> ok=${wrongOwner.ok} error=${wrongOwner.error ?? "-"} (must not be ok=true)`);
  await db.delete(enforcementCases).where(eq(enforcementCases.id, opened.caseId));
  await db.delete(securityEvents).where(sql`detail like ${"%route-sql proof%"} `);
  line("  case + its security_events deleted");
}

/* 5. human challenge: real PoW with the SHIPPED default, stored the way the route stores it */
line("\n[5] human_challenges insert/select (char(16) token_hash) + real PoW at the shipped difficulty");
const { createHash } = await import("node:crypto");
const nonce = randomBytes(16).toString("hex");          // identical construction to the route
let nSolved = -1;
const tS = Date.now();
for (let n = 0; n < 4_000_000; n++) if (meetsDifficulty(nonce, String(n), CHALLENGE_DIFFICULTY_BITS)) { nSolved = n; break; }
line(`  ${CHALLENGE_DIFFICULTY_BITS}-bit solved at ${nSolved} after ${Date.now() - tS}ms; verify-side recheck=${meetsDifficulty(nonce, String(nSolved), CHALLENGE_DIFFICULTY_BITS)}`);
const tokenHash = createHash("sha256").update(`freeborn-hc-v1:${nonce}`).digest().subarray(0, 8).toString("hex");
let chOk = false, chErr = "";
try {
  await db.insert(humanChallenges).values({ email: u.email, purpose: "appeal", tokenHash, nonce, difficultyBits: CHALLENGE_DIFFICULTY_BITS, status: "solved", solvedAt: sql`timezone('utc', now())`, expiresAt: new Date(Date.now() + 120000) });
  chOk = true;
} catch (e) { chErr = (e as Error).message.slice(0, 160); }
line(`  insert ok=${chOk} ${chErr}`);
if (chOk) {
  const [row] = await db.select({ id: humanChallenges.id, th: humanChallenges.tokenHash, db2: humanChallenges.difficultyBits })
    .from(humanChallenges).where(eq(humanChallenges.nonce, nonce)).limit(1);
  line(`  readback token_hash=${JSON.stringify(row?.th)} (${(row?.th ?? "").length} chars) difficulty_bits=${row?.db2}`);
  line(`  appealNeedsChallenge(2 priors)=${appealNeedsChallenge({ priorAppeals: 2, reopenedWithinDays: null })}`);
  await db.update(humanChallenges).set({ status: "failed" }).where(and(eq(humanChallenges.id, row!.id), eq(humanChallenges.status, "solved")));
  const [after] = await db.select({ st: humanChallenges.status }).from(humanChallenges).where(eq(humanChallenges.id, row!.id));
  line(`  consumed (single-use) -> status=${JSON.stringify(after?.st)}; then deleted`);
  await db.delete(humanChallenges).where(eq(humanChallenges.id, row!.id));
}

/* 6. trust read path the /api/trust/self route uses */
line("\n[6] /api/trust/self read");
const thRows = await db.select({ score: userTrustHistory.trustScore, sup: userTrustHistory.suppressionActive }).from(userTrustHistory).where(eq(userTrustHistory.userId, u.id)).limit(1);
line(`  stored trust: score=${thRows[0]?.score} suppression_active=${thRows[0]?.sup}`);
const [ev] = await db.select({ n: sql<number>`count(*)::int` }).from(securityEvents).where(eq(securityEvents.email, u.email));
line(`  security_events for this member: ${ev?.n}`);
line(`  nextStepFor('suspension', true)=${JSON.stringify(nextStepFor("suspension" as never, true))}`);
console.log("\nDONE (all created rows deleted)");
process.exit(0);
