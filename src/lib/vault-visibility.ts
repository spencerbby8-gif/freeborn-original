/**
 * Mutual-Filter Vault visibility (approved design v1.2).
 *
 * Server-side enforcement ONLY — nothing here is client-filterable. The
 * human-readable value exists solely inside the encrypted payload; matching
 * runs on HMAC digests, and a payload is decrypted only when at least one
 * digest pair matched. Consent freeze is BIDIRECTIONAL (invariant V-2): a
 * member whose recorded consent_version differs from the current
 * CONSENT_VERSION is vault-invisible AND vault-blind until they re-accept.
 * Their own /api/vault view/edit stays fully live (the owner path never goes
 * through this module). Unset = no match-key row = can never match.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { vaultEntries, vaultMatchKeys } from "@/db/schema";
import { CONSENT_VERSION } from "./vault-schema";
import { decryptVaultPayload } from "./vault-crypto";

export type MutualVault = { consentVersion: string; entries: Record<string, string> };

export async function getMutualVault(viewerId: string, targetId: string): Promise<MutualVault | null> {
  /* 1. The target's consent row: no row → nothing was ever consented to. */
  const [targetRow] = await db
    .select({ consentVersion: vaultEntries.consentVersion, payload: vaultEntries.payload })
    .from(vaultEntries)
    .where(eq(vaultEntries.userId, targetId))
    .limit(1);
  if (!targetRow) return null;
  /* 2. OUTBOUND freeze: stale consent hides their entries from everyone. */
  if (targetRow.consentVersion !== CONSENT_VERSION) return null;

  /* 3. The viewer's own consent row. */
  const [viewerRow] = await db
    .select({ consentVersion: vaultEntries.consentVersion })
    .from(vaultEntries)
    .where(eq(vaultEntries.userId, viewerId))
    .limit(1);
  /* 4. INBOUND freeze: absent or stale viewer consent blinds them even where
     digests would match — a stale viewer still holds digest rows, so this
     explicit check is what blocks them. */
  if (!viewerRow || viewerRow.consentVersion !== CONSENT_VERSION) return null;

  /* 5. Digest intersection on (pref_key, value_digest) — no plaintext involved. */
  const digests = await db
    .select({ userId: vaultMatchKeys.userId, prefKey: vaultMatchKeys.prefKey, valueDigest: vaultMatchKeys.valueDigest })
    .from(vaultMatchKeys)
    .where(inArray(vaultMatchKeys.userId, [viewerId, targetId]));

  const viewerSet = new Set(
    digests.filter((d) => d.userId === viewerId).map((d) => `${d.prefKey}=${d.valueDigest}`)
  );
  const matchedKeys = [
    ...new Set(
      digests
        .filter((d) => d.userId === targetId && viewerSet.has(`${d.prefKey}=${d.valueDigest}`))
        .map((d) => d.prefKey)
    ),
  ];
  if (matchedKeys.length === 0) return null;

  /* 6. Decrypt the target payload once, only after a confirmed match, and send
     ONLY the matched keys' values. An undecryptable payload fails CLOSED: no
     partial or raw data is ever surfaced, and the profile itself must not 500
     because of it. Logged without any payload content. */
  let payload: Record<string, string>;
  try {
    payload = decryptVaultPayload(targetRow.payload);
  } catch {
    console.error("[vault] payload decrypt failed for a matched profile; hiding vault");
    return null;
  }
  const entries: Record<string, string> = {};
  for (const key of matchedKeys) {
    if (typeof payload[key] === "string") entries[key] = payload[key];
  }
  if (Object.keys(entries).length === 0) return null;
  return { consentVersion: targetRow.consentVersion, entries };
}
