import { db } from "@/db";
import { vaultEntries } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { CONSENT_VERSION } from "@/lib/vault-schema";
import { VaultConfigError, encryptWithKey, resolveVaultEncryptionKey } from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

/**
 * Records the member's explicit opt-in (design rule 4): consent timestamp +
 * consent version, stored on the vault_entries row BEFORE any entry write.
 * Re-accepting after a consent_version bump preserves the encrypted payload —
 * entries are kept, and matched visibility resumes in BOTH directions the
 * moment this request lands (invariant V-2). A member who has never consented
 * gets a fresh row with an empty payload; match keys only ever appear through
 * POST /api/vault, so a consent row alone can never match anyone.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  let member;
  try {
    member = await getMember(request);
  } catch {
    return Response.json({ error: "We couldn't reach your account right now. Please try again." }, { status: 503 });
  }
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const accepted = (body as { accepted?: unknown } | null)?.accepted;
  if (accepted !== true) {
    return Response.json({ error: "Consent must be explicitly accepted." }, { status: 400 });
  }

  /* A fresh consent row carries an encrypted empty payload, so an unconfigured
     runtime must refuse here rather than write plaintext (fail closed). */
  let encryptionKey: Buffer | null;
  try {
    encryptionKey = resolveVaultEncryptionKey();
  } catch (error) {
    return Response.json(
      { error: error instanceof VaultConfigError ? error.message : "The service hiccuped. Please try again." },
      { status: 503 }
    );
  }
  if (!encryptionKey) {
    return Response.json({ error: "Vault is not configured in this environment." }, { status: 503 });
  }

  try {
    await db
      .insert(vaultEntries)
      .values({
        userId: member.id,
        consentAcceptedAt: new Date(),
        consentVersion: CONSENT_VERSION,
        payload: encryptWithKey(encryptionKey, {}),
      })
      .onConflictDoUpdate({
        target: vaultEntries.userId,
        /* Payload is deliberately untouched: existing entries and match keys
           stay valid; only the consent record moves to the current version. */
        set: { consentAcceptedAt: new Date(), consentVersion: CONSENT_VERSION },
      });
  } catch {
    return Response.json({ error: "Could not record your consent. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true, consentVersion: CONSENT_VERSION });
}
