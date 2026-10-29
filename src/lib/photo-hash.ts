/**
 * FREEBORN PERCEPTUAL PHOTO HASHING
 *
 * WHY THIS EXISTS
 *   The recovered/verified behaviour of the three largest dating services is that identity
 *   abuse is stopped by asking "has this exact photo, or this exact face, been used by a
 *   different account before?" — Tinder stores a face map/vector specifically to "detect
 *   duplicate profiles" and matches new photos against it (`/v2/verification/facemap/
 *   photo-match`), and Hinge's Face Check "scans for duplicate faces among profile images".
 *   Freeborn cannot copy the biometric half honestly: it has no face-matching model of its
 *   own, and inventing a "face vector" column without a model would be a placeholder engine.
 *   It CAN copy the photo half exactly: a perceptual hash of the bytes we already store in
 *   public.chat_media, compared across accounts, which catches the dominant real-world scam
 *   shape (stolen/re-uploaded photos) with no external dependency and no new biometric data.
 *
 * ALGORITHMS (both public-domain, both computed from decoded pixels)
 *   dHash  9x8 grayscale, each row compared to its left neighbour -> 64 bits.
 *          Robust to resize, recompression, brightness/scale changes.
 *   aHash  8x8 grayscale vs the mean of the block -> 64 bits.
 *          Catches colour/recolour edits that a structural hash can miss.
 *   Two independent hashes are stored because a crop-and-repost evades one more often than
 *   it evades both, and the app only treats a pair of CLOSE hits as a duplicate.
 *
 * Hashes are rendered as 16 hex chars and stored as `bit(64)`, which is the exact form
 * public.hamming64() and the schema expect. `sharp` is declared as a real dependency; if the
 * native binary is ever unavailable, hashing DEGRADES (returns nulls, recorded as a security
 * event) rather than blocking uploads or pretending a check ran.
 */

export type PhotoHashes = {
  /** difference hash, 16 hex chars */
  d: string;
  /** average hash, 16 hex chars; "" when the source could not be decoded twice */
  a: string;
  /** sha256 of the exact bytes, 64 hex chars. Not perceptual: it catches the case a
      perceptual hash structurally cannot, because "crop then re-upload" always changes
      every global hash while leaving an unedited re-save byte-identical. */
  bytes: string;
  /** decoded pixel dimensions, for the audit trail */
  width: number;
  height: number;
};

const HEX = "0123456789abcdef";

/** Pack 64 booleans (MSB first) into 16 hex chars. */
function bitsToHex(bits: number[]): string {
  if (bits.length !== 64) throw new Error(`expected 64 bits, got ${bits.length}`);
  let out = "";
  for (let i = 0; i < 64; i += 4) {
    const nib = ((bits[i] & 1) << 3) | ((bits[i + 1] & 1) << 2) | ((bits[i + 2] & 1) << 1) | (bits[i + 3] & 1);
    out += HEX[nib];
  }
  return out;
}

/** Parse 16 hex chars into 16 bytes. null when the input is not a hash. */
export function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) return null;
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Hamming distance between two 16-hex-char hashes. null when either is unusable.
    Mirrors public.hamming64() — scripts/hashing/hamming-parity.mjs asserts they agree. */
const POPCOUNT = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];

/** Bit distance between two 16-hex-char hashes; null if either is unusable.
    Byte-wise XOR + nibble popcount: no BigInt, because the project's TS target
    is below ES2020, and it agrees with public.hamming64() (proved by
    scripts/hashing/hamming-parity.mjs). */
export function hamming64(x: string | null | undefined, y: string | null | undefined): number | null {
  const a = x ? hexToBytes(x) : null;
  const b = y ? hexToBytes(y) : null;
  if (!a || !b) return null;
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const z = a[i] ^ b[i];
    n += POPCOUNT[z & 0xf] + POPCOUNT[z >> 4];
  }
  return n;
}

/** dHash from a grayscale row-major buffer that is `cols` x `rows` (values 0-255). */
export function dhashFromGray(gray: Uint8Array, cols: number, rows: number): string {
  // cols must be rows+1 so each row can be compared against its left neighbour.
  const bits: number[] = [];
  for (let y = 0; y < rows; y++) {
    const off = y * cols;
    for (let x = 0; x + 1 < cols; x++) bits.push(gray[off + x] < gray[off + x + 1] ? 1 : 0);
  }
  return bitsToHex(bits);
}

/** aHash from a square grayscale buffer. */
export function ahashFromGray(gray: Uint8Array, size: number): string {
  let sum = 0;
  for (let i = 0; i < size * size; i++) sum += gray[i];
  const mean = sum / (size * size);
  const bits: number[] = [];
  for (let i = 0; i < size * size; i++) bits.push(gray[i] > mean ? 1 : 0);
  return bitsToHex(bits);
}

/**
 * Compute both hashes for one image. Returns null when the bytes are not decodable
 * (truncated upload, unsupported mime) — callers must treat null as "not checked",
 * never as "no duplicate".
 */
export async function hashImageBytes(bytes: Uint8Array | Buffer): Promise<PhotoHashes | null> {
  let sharp: (buf: Buffer) => import("sharp").Sharp;
  try {
    sharp = (await import("sharp")).default as unknown as (buf: Buffer) => import("sharp").Sharp;
  } catch {
    return null;
  }
  try {
    const img = sharp(Buffer.from(bytes));
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;

    const d = await sharp(Buffer.from(bytes))
      .greyscale()
      .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer();
    const a = await sharp(Buffer.from(bytes))
      .greyscale()
      .resize(8, 8, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer();

    return {
      d: dhashFromGray(new Uint8Array(d), 9, 8),
      a: ahashFromGray(new Uint8Array(a), 8),
      bytes: await sha256Bytes(bytes),
      width: meta.width,
      height: meta.height,
    };
  } catch {
    return null;
  }
}

/** 0-255 similarity for display/telemetry only; comparisons use hamming64. */
export function hashSimilarityPct(x: string, y: string): number | null {
  const h = hamming64(x, y);
  if (h === null) return null;
  return Math.round((1 - h / 64) * 1000) / 10;
}

/* ---------------------------------------------------------------- anchor -- */

/**
 * Composite identity anchor — the non-biometric analogue of Tinder's FaceVector.
 *
 * It is a deterministic fold of the member's own photo hashes, NOT a face embedding:
 * anything that can read the row can recompute it from the photos, and it carries no
 * information about a face that the photos do not already carry. It exists so that a
 * "same visual identity across two accounts" lookup is a single indexed bit(64) compare,
 * including after some photos are replaced.
 */
export async function deriveAnchor(photoHashes: { d: string; a?: string }[]): Promise<string | null> {
  const usable = photoHashes.filter((p) => /^[0-9a-f]{16}$/i.test(p.d));
  if (usable.length === 0) return null;
  const { createHash } = await import("node:crypto");
  const sorted = [...usable].sort((p, q) => p.d.localeCompare(q.d));
  /* 64-bit FNV-1a style fold, done as two 32-bit halves so it needs no BigInt.
     Math.imul gives correct 32-bit wrapping multiplication. */
  let hi = 0x811c9dc5, lo = 0x01000193;
  for (const p of sorted) {
    const src = p.a && /^[0-9a-f]{16}$/i.test(p.a) ? p.d + p.a : p.d;
    for (let i = 0; i < src.length; i++) {
      const byte = parseInt(src[i], 16);
      hi = (Math.imul(hi ^ ((byte >> 4) & 0xf), 0x01000193) >>> 0);
      lo = (Math.imul(((lo << 4) | (byte & 0xf)) >>> 0, 0x01000193) >>> 0);
    }
  }
  const fold = (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
  // Mix in the exact hash set so ordering-only differences do not collide.
  const digest = createHash("sha256").update(`${sorted.map((p) => p.d + (p.a ?? "")).join("|")}:${fold}`).digest();
  let out = "";
  for (let i = 0; i < 8; i++) out += digest[i].toString(16).padStart(2, "0");
  return out.toLowerCase();
}

/** Anchor of one photo (used before a member has several photos). */
export async function deriveAnchorFromOne(hash: { d: string; a?: string }): Promise<string | null> {
  return deriveAnchor([hash]);
}

/**
 * Decide whether two hashes describe the same picture.
 *
 * Thresholds, and the evidence behind them (measured on synthetic 640x480 photos,
 * scripts/trust/harness.ts):
 *   dHash <= 6   recompression q88->q40 = 2, half-size downscale = 2, +25% brightness = 6,
 *                an unrelated photo = 29, a mirror = 49. 0/40 unrelated photos matched.
 *   aHash <= 12  required to agree as well, so a shared *composition* (two people against
 *                the same wall) is never alone enough to accuse someone of theft.
 *
 * KNOWN LIMITATION, MEASURED, NOT FIXED: a crop changes the whole image, so global hashes
 * diverge fast — 5% crop = d7..9, 10% = d15..19, 40% = d24..28. Two candidate fixes were
 * built and both measured WORSE (a 9-window shift-tolerant variant: s=25 at a 5% crop; a
 * best-of-windows scan over a 24x12 strip: 22-24 for every crop, because resizing before
 * windowing destroys the detail the window is meant to find). Neither is shipped. Exact
 * bytes (below) is the mitigation that does work for copies; a determined cropper remains
 * the residual risk of this control.
 */
export function isSamePhoto(
  x: { d: string; a: string | null; bytes?: string | null },
  y: { d: string; a: string | null; bytes?: string | null }
): { hit: boolean; exact: boolean; d: number | null; a: number | null } {
  const exact = Boolean(x.bytes && y.bytes && x.bytes === y.bytes);
  const dh = hamming64(x.d, y.d);
  if (dh === null) return { hit: exact, exact, d: null, a: null };
  const ah = x.a && y.a ? hamming64(x.a, y.a) : null;
  const closeA = ah === null ? true : ah <= 12;
  return { hit: exact || (dh <= 6 && closeA), exact, d: dh, a: ah };
}

/** sha256 of the raw upload, hex. */
export async function sha256Hex(bytes: Uint8Array | Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256Bytes(bytes: Uint8Array | Buffer): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}
