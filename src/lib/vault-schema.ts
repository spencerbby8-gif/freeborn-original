/**
 * Mutual-Filter Vault — closed launch registry (approved design v1.2, decision H3).
 *
 * Keys and values are a CLOSED allowlist: no free text ever enters the Vault,
 * which keeps value normalization collision-free and bounds the HMAC input
 * space. "prefer_not_to_say" is stored as its own ordinary value and matches
 * only itself (decision Q2). Unset = no match = nothing revealed: absence of a
 * match-key row can never match.
 */

export const CONSENT_VERSION = "2026-11-v1";

export const VAULT_KEYS = ["vaccination_stance"] as const;
export type VaultKey = (typeof VAULT_KEYS)[number];

export const VAULT_VALUES: Record<VaultKey, readonly string[]> = {
  vaccination_stance: ["vaccinated", "unvaccinated", "prefer_not_to_say"],
};

/** Human-readable labels for the settings editor and the profile card. */
export const VAULT_VALUE_LABELS: Record<string, string> = {
  vaccinated: "Vaccinated",
  unvaccinated: "Unvaccinated",
  prefer_not_to_say: "Prefer not to say",
};

export function isVaultKey(raw: unknown): raw is VaultKey {
  return typeof raw === "string" && (VAULT_KEYS as readonly string[]).includes(raw);
}

/** Trim, lowercase, collapse internal whitespace. Enum membership is checked AFTER normalization. */
export function normalizeVaultValue(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

export type VaultEntriesResult =
  | { ok: true; entries: Record<string, string> }
  | { ok: false; error: string };

/**
 * Validates a member-supplied entries object against the closed allowlist.
 * Unknown keys and off-enum values are refused, never coerced. An absent or
 * empty object means "clear every preference" and is valid.
 */
export function validateVaultEntries(input: unknown): VaultEntriesResult {
  if (input === null || input === undefined) return { ok: true, entries: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Entries must be an object of preference key to answer." };
  }
  const raw = input as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length > VAULT_KEYS.length) return { ok: false, error: "Unknown private preference key." };
  const entries: Record<string, string> = {};
  for (const key of keys) {
    if (!isVaultKey(key)) return { ok: false, error: "Unknown private preference key." };
    const value = normalizeVaultValue(raw[key]);
    if (!(VAULT_VALUES[key] as readonly string[]).includes(value)) {
      return { ok: false, error: "Choose a supported answer for this preference." };
    }
    entries[key] = value;
  }
  return { ok: true, entries };
}
