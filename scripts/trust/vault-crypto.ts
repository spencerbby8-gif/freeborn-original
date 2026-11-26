/* Mutual-Filter Vault crypto harness — tests exactly what ships:
   src/lib/vault-crypto.ts and src/lib/vault-schema.ts, bundled with esbuild
   (which resolves the @/ alias) and run under node, in the style of
   scripts/trust/harness.ts. All keys/peppers here are deterministic test
   buffers — never real secrets. */
import assert from "node:assert/strict";
import {
  VaultConfigError,
  decryptWithKey,
  digestWithPepper,
  encryptWithKey,
  isVaultConfigured,
  resolveVaultEncryptionKey,
  resolveVaultMatchPepper,
} from "@/lib/vault-crypto";
import {
  CONSENT_VERSION,
  VAULT_KEYS,
  VAULT_VALUES,
  normalizeVaultValue,
  validateVaultEntries,
} from "@/lib/vault-schema";

let n = 0;
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  console.log(`ok ${++n} - ${name}`);
}
const KEY = (label: string) => Buffer.alloc(32, label.charCodeAt(0));
/** process.env.NODE_ENV is typed read-only by Next's env typings; the harness
    must still exercise both runtime modes, so it writes through a cast. */
const setNodeEnv = (value: string): void => {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
};

await check("AES-256-GCM round-trip returns the original entries", () => {
  const entries = { vaccination_stance: "vaccinated" };
  assert.deepEqual(decryptWithKey(KEY("k"), encryptWithKey(KEY("k"), entries)), entries);
});

await check("tampered ciphertext is rejected by the auth tag", () => {
  const envelope = encryptWithKey(KEY("k"), { vaccination_stance: "vaccinated" });
  const parts = envelope.split("."); // ["fbvault", "v1", iv, ct, tag] — the prefix carries a dot
  const ct = Buffer.from(parts[3], "base64url");
  ct[0] ^= 0xff;
  const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${ct.toString("base64url")}.${parts[4]}`;
  assert.throws(() => decryptWithKey(KEY("k"), tampered));
});

await check("tampered envelope prefix is rejected", () => {
  const envelope = encryptWithKey(KEY("k"), { vaccination_stance: "vaccinated" });
  const parts = envelope.split(".");
  assert.throws(() => decryptWithKey(KEY("k"), `fbvault.v9.${parts[2]}.${parts[3]}.${parts[4]}`));
  assert.throws(() => decryptWithKey(KEY("k"), `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`));
});

await check("wrong key fails closed (never partial data)", () => {
  assert.throws(() => decryptWithKey(KEY("x"), encryptWithKey(KEY("k"), { a: "b" })));
});

await check("HMAC digest is deterministic, 64 lowercase hex chars", () => {
  const digest = digestWithPepper(KEY("p"), "vaccination_stance", "vaccinated");
  assert.equal(digest.length, 64);
  assert.equal(digest, digest.toLowerCase());
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest, digestWithPepper(KEY("p"), "vaccination_stance", "vaccinated"));
});

await check("normalization collapses case and whitespace before matching", () => {
  assert.equal(
    digestWithPepper(KEY("p"), "vaccination_stance", normalizeVaultValue("  Vaccinated  ")),
    digestWithPepper(KEY("p"), "vaccination_stance", normalizeVaultValue("vaccinated"))
  );
});

await check("different values and different keys never share a digest", () => {
  assert.notEqual(digestWithPepper(KEY("p"), "vaccination_stance", "vaccinated"), digestWithPepper(KEY("p"), "vaccination_stance", "unvaccinated"));
  assert.notEqual(digestWithPepper(KEY("p"), "vaccination_stance", "vaccinated"), digestWithPepper(KEY("p"), "family_plans", "vaccinated"));
});

await check("closed allowlist: unknown key is refused", () => {
  const result = validateVaultEntries({ not_a_key: "vaccinated" });
  assert.equal(result.ok, false);
});

await check("closed allowlist: off-enum value is refused, never coerced", () => {
  const result = validateVaultEntries({ vaccination_stance: "sometimes" });
  assert.equal(result.ok, false);
});

await check("closed allowlist: normalized enum value is accepted", () => {
  const result = validateVaultEntries({ vaccination_stance: "  Vaccinated " });
  assert.ok(result.ok && result.entries.vaccination_stance === "vaccinated");
});

await check("empty/absent entries clear every preference (valid)", () => {
  assert.deepEqual(validateVaultEntries(undefined), { ok: true, entries: {} });
  assert.deepEqual(validateVaultEntries({}), { ok: true, entries: {} });
});

await check("prefer_not_to_say is an ordinary value matching only itself (decision H3/Q2)", () => {
  assert.ok((VAULT_VALUES.vaccination_stance as readonly string[]).includes("prefer_not_to_say"));
  assert.ok(VAULT_KEYS.includes("vaccination_stance"));
  const digest = digestWithPepper(KEY("p"), "vaccination_stance", "prefer_not_to_say");
  assert.equal(digest, digestWithPepper(KEY("p"), "vaccination_stance", "prefer_not_to_say"));
  assert.notEqual(digest, digestWithPepper(KEY("p"), "vaccination_stance", "vaccinated"));
});

await check("consent version constant is a non-empty string", () => {
  assert.equal(typeof CONSENT_VERSION, "string");
  assert.ok(CONSENT_VERSION.length > 0);
});

/* --- Lazy env behavior (env is mutated and restored around each check) --- */

await check("missing secrets in production fail closed", () => {
  const savedNode = process.env.NODE_ENV;
  delete process.env.VAULT_ENCRYPTION_KEY;
  delete process.env.VAULT_MATCH_PEPPER;
  setNodeEnv("production");
  try {
    assert.throws(() => resolveVaultEncryptionKey(), VaultConfigError);
    assert.throws(() => resolveVaultMatchPepper(), VaultConfigError);
    assert.equal(isVaultConfigured(), false);
  } finally {
    setNodeEnv(savedNode);
  }
});

await check("missing secrets in development do not crash — explicit not-configured", () => {
  const savedNode = process.env.NODE_ENV;
  delete process.env.VAULT_ENCRYPTION_KEY;
  delete process.env.VAULT_MATCH_PEPPER;
  setNodeEnv("development");
  try {
    assert.equal(resolveVaultEncryptionKey(), null);
    assert.equal(resolveVaultMatchPepper(), null);
    assert.equal(isVaultConfigured(), false);
  } finally {
    setNodeEnv(savedNode);
  }
});

await check("malformed secret length fails closed in production", () => {
  const savedNode = process.env.NODE_ENV;
  const savedKey = process.env.VAULT_ENCRYPTION_KEY;
  setNodeEnv("production");
  process.env.VAULT_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
  try {
    assert.throws(() => resolveVaultEncryptionKey());
  } finally {
    setNodeEnv(savedNode);
    if (savedKey === undefined) delete process.env.VAULT_ENCRYPTION_KEY;
    else process.env.VAULT_ENCRYPTION_KEY = savedKey;
  }
});

await check("valid 32-byte base64 secrets resolve and configure the vault", () => {
  const savedNode = process.env.NODE_ENV;
  setNodeEnv("development");
  process.env.VAULT_ENCRYPTION_KEY = KEY("k").toString("base64");
  process.env.VAULT_MATCH_PEPPER = KEY("p").toString("base64");
  try {
    assert.equal(resolveVaultEncryptionKey()?.length, 32);
    assert.equal(resolveVaultMatchPepper()?.length, 32);
    assert.equal(isVaultConfigured(), true);
  } finally {
    setNodeEnv(savedNode);
  }
});

console.log(`\n${n} vault-crypto checks passed`);
