/* Photo-hash backfill — production-safe, idempotent, and honest about what it cannot do.
 *
 * WHY A SEPARATE SCRIPT
 *   The only previous backfill lived inside scripts/trust/live-proof.ts and handled just
 *   `/api/chat/media/<uuid>` rows, reading bytes from the chat_media table. The other
 *   shape a profile photo can take — a bare Supabase Storage object key, e.g.
 *   `b9bc7ac1-…/1791425669828-9s95iu.jpg` — fell through to "not a local media row,
 *   skipped". That is why 7 of 11 production photos were still unhashed: not a failure,
 *   a silent gap in the instrument. This script handles both shapes.
 *
 * SAFETY
 *   - touches ONLY profile_photos.phash_d / phash_a / phash_bytes / phash_at;
 *   - selects rows where phash_d is null, so re-running costs one pass over the residue
 *     and cannot rehash or churn already-hashed rows;
 *   - never deletes, never writes enforcement state, never opens a case. Duplicate
 *     detection on the newly hashed set is a separate, deliberate act
 *     (identity-resolve.findDuplicatePhotos) so backfill and enforcement stay decidable
 *     apart;
 *   - a non-decodable or unreachable image is reported, not guessed.
 *
 * Run:
 *   SUPABASE_TRANSACTION_POOLER=... SUPABASE_URL=... node scripts/trust/.backfill.build.mjs [--dry]
 */
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema";
import { hashImageBytes } from "../../src/lib/photo-hash";

const DRY = process.argv.includes("--dry");
const poolUrl = process.env.SUPABASE_TRANSACTION_POOLER ?? process.env.DATABASE_URL ?? "";
if (!poolUrl) {
  console.error("SUPABASE_TRANSACTION_POOLER (or DATABASE_URL) is required. Nothing was written.");
  process.exit(2);
}
const storageBase = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");

const pool = new Pool({ connectionString: poolUrl, max: 2 });
const db = drizzle(pool, { schema });

const BUCKET_KEY = /^[A-Za-z0-9-]{36}\/[A-Za-z0-9._-]+$/;
const LOCAL_MEDIA = /^\/api\/chat\/media\/([0-9a-f-]{36})$/i;

/* Column list verified against public.profile_photos rather than assumed: there is no
   bucket_id here, the bucket is fixed by the upload path. */
type Row = { id: string; userId: string; storagePath: string | null };


/* drizzle's execute() over node-postgres returns { rows, rowCount }, not a bare array.
   Unwrap it in one place so every query below behaves the same way. */
const q = async <T,>(text: ReturnType<typeof sql>): Promise<T[]> => {
  const r = (await db.execute(text)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r?.rows ?? []);
};

const rows = await q<Row>(
  sql`select id, user_id as "userId", storage_path as "storagePath"
        from public.profile_photos
        where phash_d is null
        order by created_at`
);

console.log(`unhashed rows: ${rows.length}${DRY ? "  (dry run, nothing will be written)" : ""}`);

let hashed = 0;
const skipped: { id: string; why: string }[] = [];

for (const r of rows) {
  let bytes: Buffer | null = null;

  const local = r.storagePath ? LOCAL_MEDIA.exec(r.storagePath) : null;
  if (local) {
    const [m] = await q<{ data: Buffer | Uint8Array | null }>(
      sql`select data, mime from public.chat_media where id = ${local[1]}::uuid limit 1`
    );
    if (m?.data) bytes = Buffer.from(m.data as Uint8Array);
    else skipped.push({ id: r.id, why: "chat_media row has no bytes" });
  } else if (r.storagePath && BUCKET_KEY.test(r.storagePath)) {
    if (!storageBase) {
      skipped.push({ id: r.id, why: "SUPABASE_URL unset, cannot reach storage" });
      continue;
    }
    /* The bucket is public (profile photos must be renderable by other members), so this
       needs no credential. If it is ever locked down, this becomes an authenticated fetch
       and the row is reported as unreachable rather than silently skipped. */
    const url = `${storageBase}/storage/v1/object/public/profile-photos/${r.storagePath}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
      else skipped.push({ id: r.id, why: `storage HTTP ${res.status}` });
    } catch (e) {
      skipped.push({ id: r.id, why: `fetch failed: ${(e as Error)?.name ?? e}` });
    }
  } else {
    skipped.push({ id: r.id, why: `unrecognised storage_path shape: ${String(r.storagePath).slice(0, 48)}` });
    continue;
  }

  if (!bytes || bytes.length < 64) {
    if (!skipped.some((s) => s.id === r.id)) skipped.push({ id: r.id, why: "no bytes" });
    continue;
  }

  const h = await hashImageBytes(bytes).catch(() => null);
  if (!h) {
    skipped.push({ id: r.id, why: `undecodable image (${bytes.length} B) — recorded, not guessed` });
    continue;
  }

  console.log(
    `  ${r.id.slice(0, 8)} user ${r.userId.slice(0, 8)} ${bytes.length}B -> d=${h.d} a=${h.a} ${h.width}x${h.height}`
  );
  if (!DRY) {
    await db.execute(
      sql`update public.profile_photos
            set phash_d = ${h.d}, phash_a = ${h.a}, phash_bytes = ${h.bytes},
                phash_at = timezone('utc', now())
          where id = ${r.id}::uuid`
    );
  }
  hashed++;
}

console.log(`\nhashed=${hashed} skipped=${skipped.length} dry=${DRY}`);
for (const s of skipped) console.log(`  skip ${s.id.slice(0, 8)}: ${s.why}`);
const [after] = await q<{ hashed: number; total: number }>(
  sql`select count(*) filter (where phash_d is not null)::int as hashed, count(*)::int as total
        from public.profile_photos`
);
console.log(`production now: ${after?.hashed}/${after?.total} photos hashed`);
if (!DRY && after && after.hashed === after.total) console.log("backfill complete: every stored photo has a hash");

await pool.end();
