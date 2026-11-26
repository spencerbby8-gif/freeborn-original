/**
 * Mutual-Filter Vault crypto — Node built-ins ONLY (no new dependencies).
 *
 * Two independent secrets, per approved design §B (kept separate on purpose:
 * different blast radii and rotation stories — rotating the encryption key
 * invalidates payloads and members re-save; rotating the pepper forces a
 * one-time re-HMAC of vault_match_keys):
 *
 *   VAULT_ENCRYPTION_KEY  — 32 bytes base64; AES-256-GCM key for vault payloads.
 *   VAULT_MATCH_PEPPER    — 32 bytes base64; HMAC-SHA256 key for equality digests.
 *
 * Both are read LAZILY at first use (precedent: src/db/index.ts resolves the
 * connection string inside createDb() so `next build` never needs it). Missing
 * or malformed secrets FAIL CLOSED in production (VERCEL_ENV set or
 * NODE_ENV=production): vault routes answer an explicit error and no plaintext
 * is ever written. Local development without the env vars stays buildable and
 * runnable — routes report "not configured" instead of crashing, and `next
 * build` never executes these function bodies.
 *
 * Residual risk (also recorded in SECURITY.md): digest equality over a closed
 * value enumeration is only as strong as the pepper — a leak of BOTH the
 * database and VAULT_MATCH_PEPPER could invert digests by brute-forcing the
 * small enum. Per-user salts are impossible by design (they would break
 * cross-member matching). Treat the pepper like SUPABASE_TRANSACTION_POOLER.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "fbvault.v1";
const ENVELOPE_PARTS = 4;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class VaultConfigError extends Error {
  constructor(message = "Vault is not configured in this environment.") {
    super(message);
    this.name = "VaultConfigError";
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
}

function decodeSecret(raw: string, expectedBytes: number): Buffer {
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("Vault secret is not valid base64.");
  }
  if (key.length !== expectedBytes) {
    throw new Error(`Vault secret must decode to exactly ${expectedBytes} bytes.`);
  }
  return key;
}

let cachedEncryptionKey: { raw: string; key: Buffer } | undefined;
/**
 * Resolves the payload encryption key. Throws (fail closed) in production when
 * missing or malformed; returns null in an unconfigured development runtime.
 * Only successful resolutions are cached, so rotating the env var (or a test
 * mutating it) takes effect on the next call.
 */
export function resolveVaultEncryptionKey(): Buffer | null {
  const raw = process.env.VAULT_ENCRYPTION_KEY;
  if (!raw) {
    if (isProductionRuntime()) throw new VaultConfigError();
    return null;
  }
  if (cachedEncryptionKey?.raw === raw) return cachedEncryptionKey.key;
  try {
    const key = decodeSecret(raw, KEY_BYTES);
    cachedEncryptionKey = { raw, key };
    return key;
  } catch (error) {
    if (isProductionRuntime()) throw error;
    return null;
  }
}

let cachedPepper: { raw: string; key: Buffer } | undefined;
/** Same contract as resolveVaultEncryptionKey, for the HMAC pepper. */
export function resolveVaultMatchPepper(): Buffer | null {
  const raw = process.env.VAULT_MATCH_PEPPER;
  if (!raw) {
    if (isProductionRuntime()) throw new VaultConfigError();
    return null;
  }
  if (cachedPepper?.raw === raw) return cachedPepper.key;
  try {
    const key = decodeSecret(raw, KEY_BYTES);
    cachedPepper = { raw, key };
    return key;
  } catch (error) {
    if (isProductionRuntime()) throw error;
    return null;
  }
}

/** True only when BOTH secrets are usable in this runtime. Never throws. */
export function isVaultConfigured(): boolean {
  try {
    return resolveVaultEncryptionKey() !== null && resolveVaultMatchPepper() !== null;
  } catch {
    return false;
  }
}

/* --- Pure primitives (no env reads) — the harness tests these directly --- */

/** AES-256-GCM. Envelope: `fbvault.v1.<iv>.<ciphertext>.<tag>`, base64url parts. */
export function encryptWithKey(key: Buffer, entries: Record<string, string>): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(ENVELOPE_PREFIX, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(entries), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_PREFIX, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

/** Auth-tag failure (tamper or wrong key) throws — fail closed, never partial data.
    The prefix itself contains a dot, so parsing slices the prefix off first and
    splits only the three remaining base64url parts. */
export function decryptWithKey(key: Buffer, envelope: string): Record<string, string> {
  const prefixed = ENVELOPE_PREFIX + ".";
  if (!envelope.startsWith(prefixed)) {
    throw new Error("Vault payload envelope is unreadable.");
  }
  const parts = envelope.slice(prefixed.length).split(".");
  if (parts.length !== ENVELOPE_PARTS - 1) {
    throw new Error("Vault payload envelope is unreadable.");
  }
  const iv = Buffer.from(parts[0], "base64url");
  const ciphertext = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(ENVELOPE_PREFIX, "utf8"));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Vault payload is not an entries object.");
  }
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") entries[k] = v;
  }
  return entries;
}

/** HMAC-SHA256 over "<key>=<normalized value>" — 64 lowercase hex chars (char(64)). */
export function digestWithPepper(pepper: Buffer, prefKey: string, normalizedValue: string): string {
  return createHmac("sha256", pepper).update(`${prefKey}=${normalizedValue}`).digest("hex");
}

/* --- Lazy wrappers used by routes and the visibility module --- */

export function encryptVaultPayload(entries: Record<string, string>): string {
  const key = resolveVaultEncryptionKey();
  if (!key) throw new VaultConfigError();
  return encryptWithKey(key, entries);
}

export function decryptVaultPayload(envelope: string): Record<string, string> {
  const key = resolveVaultEncryptionKey();
  if (!key) throw new VaultConfigError();
  return decryptWithKey(key, envelope);
}

export function vaultMatchDigest(prefKey: string, normalizedValue: string): string {
  const pepper = resolveVaultMatchPepper();
  if (!pepper) throw new VaultConfigError();
  return digestWithPepper(pepper, prefKey, normalizedValue);
}
