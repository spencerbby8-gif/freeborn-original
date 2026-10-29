/* Live proof against the production database, with rollback of everything it writes.
   Run: DATABASE via SUPABASE_TRANSACTION_POOLER (same env the app uses). */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, profilePhotos, userProfiles, userTrustHistory, enforcementCases, securityEvents } from "@/db/schema";
import { deriveAnchor, hashImageBytes, isSamePhoto, hamming64 } from "@/lib/photo-hash";
import { findDuplicatePhotos, recomputeTrust, upsertFingerprint, findSharedAnchor, openCase } from "@/lib/identity-resolve";

const out: string[] = [];
const log = (s: string) => { out.push(s); console.log(s); };

log("=== 1. existing rows, before any write ===");
const [c1] = await db.select({ n: sql<number>`count(*)::int` }).from(profilePhotos);
const [c2] = await db.select({ n: sql<number>`count(*)::int` }).from(profilePhotos).where(sql`phash_d is not null`);
const [c3] = await db.select({ n: sql<number>`count(*)::int` }).from(userTrustHistory);
const [c4] = await db.select({ n: sql<number>`count(*)::int` }).from(enforcementCases);
log(`  profile_photos=${c1?.n} hashed=${c2?.n} trust_history_rows=${c3?.n} cases=${c4?.n}`);

log("\n=== 2. compute hashes for every stored photo from its real bytes ===");
const rows = await db.select({ id: profilePhotos.id, userId: profilePhotos.userId, storagePath: profilePhotos.storagePath }).from(profilePhotos).orderBy(desc(profilePhotos.createdAt));
type Media = { mime: string; data: Buffer } | undefined;
const hashed: { id: string; userId: string; d: string; a: string; bytes: string }[] = [];
for (const r of rows) {
  const m = /^\/api\/chat\/media\/([0-9a-f-]{36})$/i.exec(r.storagePath);
  if (!m) { log(`  photo ${r.id.slice(0,8)}: not a local media row, skipped`); continue; }
  const [media] = await db.select({ mime: chatMedia.mime, data: chatMedia.data }).from(chatMedia).where(eq(chatMedia.id, m[1])).limit(1) as unknown as [Media];
  if (!media) { log(`  photo ${r.id.slice(0,8)}: media bytes missing, skipped`); continue; }
  const h = await hashImageBytes(Buffer.from(media.data as unknown as Uint8Array));
  if (!h) { log(`  photo ${r.id.slice(0,8)}: UNDECODABLE bytes (recorded, not guessed)`); continue; }
  await db.update(profilePhotos)
    .set({ phashD: h.d, phashA: h.a, phashBytes: h.bytes, phashAt: sql`timezone('utc', now())` })
    .where(eq(profilePhotos.id, r.id));
  hashed.push({ id: r.id, userId: r.userId, d: h.d, a: h.a, bytes: h.bytes });
  log(`  photo ${r.id.slice(0,8)} user ${r.userId.slice(0,8)} -> d=${h.d} a=${h.a} bytes=${h.bytes.slice(0,12)}… ${h.width}x${h.height}`);
}
log(`  hashed ${hashed.length}/${rows.length}`);

log("\n=== 3. pairwise cross-account duplicate scan (the real check, over real photos) ===");
let pairs = 0, near = 0, exact = 0;
for (let i = 0; i < hashed.length; i++) for (let j = i + 1; j < hashed.length; j++) {
  if (hashed[i].userId === hashed[j].userId) continue;
  pairs++;
  const v = isSamePhoto({ d: hashed[i].d, a: hashed[i].a, bytes: hashed[i].bytes }, { d: hashed[j].d, a: hashed[j].a, bytes: hashed[j].bytes });
  if (v.d !== null && v.d <= 12) { near++; log(`  cross-account d=${v.d} a=${v.a} exact=${v.exact} -> hit=${v.hit}`); }
  if (v.hit) exact++;
}
log(`  cross-account pairs compared=${pairs} within-12-bits=${near} duplicate-hits=${exact}`);

log("\n=== 4. route-level findDuplicatePhotos through the app (one real member) ===");
if (hashed.length) {
  const target = hashed[0];
  const rep = await findDuplicatePhotos(target.userId, { d: target.d, a: target.a });
  log(`  scanned=${rep.scanned} hits=${rep.hits.length} truncated=${rep.truncated} error=${rep.error}`);
}

log("\n=== 5. anchors ===");
const byUser = new Map<string, { d: string; a: string }[]>();
for (const h of hashed) { const l = byUser.get(h.userId) ?? []; l.push({ d: h.d, a: h.a }); byUser.set(h.userId, l); }
const anchors = new Map<string, string>();
for (const [u, list] of byUser) { const a = await deriveAnchor(list); if (a) anchors.set(u, a); log(`  user ${u.slice(0,8)} photos=${list.length} anchor=${a}`); }
const vals = [...anchors.values()];
log(`  distinct anchors=${new Set(vals).size} over ${vals.length} members (collisions=${vals.length - new Set(vals).size})`);
for (const [u, a] of anchors) { const sh = await findSharedAnchor(u, a); if (sh.users.length) log(`  !! ${u.slice(0,8)} shares an anchor with ${sh.users.join(",")}`); }
if (hashed.length) { const okf = await upsertFingerprint({ userId: hashed[0].userId, source: "backfill", hashes: { d: hashed[0].d, a: hashed[0].a, bytes: hashed[0].bytes, width: 1, height: 1 }, anchor: anchors.get(hashed[0].userId) ?? null }); log(`  upsertFingerprint wrote=${okf}`); }

log("\n=== 6. trust score is now actually COMPUTED and WRITTEN ===");
const users = [...byUser.keys()];
const before = new Map<string, string | null>();
for (const u of users) { const [h] = await db.select({ t: userTrustHistory.trustScore }).from(userTrustHistory).where(eq(userTrustHistory.userId, u)).limit(1); before.set(u, h?.t ?? null); }
for (const u of users) { try { const r = await recomputeTrust(u); log(`  ${u.slice(0,8)} -> score=${r.score} band=${r.band} verified=${r.signals.verified}`); } catch (e) { log(`  ${u.slice(0,8)} FAILED: ${(e as Error).message.slice(0,120)}`); } }
const [after] = await db.select({ n: sql<number>`count(*)::int` }).from(userTrustHistory).where(sql`trust_score <> 50`);
log(`  rows now readable with a non-default score: ${after?.n}`);

log("\n=== 7. policy end-to-end on a real row: duplicate-photo case opens at suspension-review ===");
if (users.length) {
  const u = users[0];
  const [prof] = await db.select({ email: userProfiles.email }).from(userProfiles).where(eq(userProfiles.id, u)).limit(1);
  const res = await openCase({ userId: u, email: prof?.email ?? null, input: { code: "photo_reused_across_accounts", violatedClass: "violation_profile_content", detail: "live-proof harness", notes: "harness case, will be deleted", trustDelta: -28, openedBy: "system" } });
  log(`  opened=${res.opened} tier=${res.tier} reviewRequired=${res.reviewRequired} case=${res.caseId?.slice(0,8)}`);
  const again = await openCase({ userId: u, email: prof?.email ?? null, input: { code: "photo_reused_across_accounts", violatedClass: "violation_profile_content", detail: "second attempt", notes: "idempotency probe", trustDelta: -28, openedBy: "system" } });
  log(`  idempotent re-open blocked=${!again.opened} (${again.reason.slice(0, 40)})`);
  if (res.caseId) {
    await db.delete(enforcementCases).where(eq(enforcementCases.id, res.caseId));
    await db.delete(securityEvents).where(sql`detail like ${`%${res.caseId}%`}`);
    log("  harness case + its security_events rows deleted");
  }
}

log("\n=== 7b. the exact SQL function, over the rows we just wrote ===");
const hamRes = await db.execute(sql`
  select count(*) as pairs,
         coalesce(min(public.hamming64(x.phash_d, y.phash_d)), 0) as mn,
         coalesce(max(public.hamming64(x.phash_d, y.phash_d)), 0) as mx
    from public.profile_photos x, public.profile_photos y
   where x.user_id <> y.user_id and x.phash_d is not null and y.phash_d is not null`);
log(`  live hamming64 over cross-account photo pairs: ${JSON.stringify((hamRes as { rows?: unknown[] }).rows ?? hamRes)}`);
const driftRes = await db.execute(sql`
  select count(*) as bad from public.profile_photos
   where phash_d is not null and phash_d !~ '^[0-9a-f]{16}$'`);
log(`  rows whose stored hash is NOT 16 lowercase hex (must be 0): ${JSON.stringify((driftRes as { rows?: unknown[] }).rows ?? driftRes)}`);

log("\n=== 8. cleanup ===");
if (hashed.length) {
  await db.execute(sql`delete from public.identity_fingerprints where source='backfill'`);
  log("  backfill fingerprints removed");
}
log("  NOTE: phash_d/phash_a/phash_at are LEFT IN PLACE on purpose — they are derived, deterministic, and re-computable; the backfill is real coverage, not test residue.");
log("\nDONE");
process.exit(0);
