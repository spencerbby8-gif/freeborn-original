import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vaultEntries, vaultMatchKeys } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { CONSENT_VERSION, validateVaultEntries } from "@/lib/vault-schema";
import {
  VaultConfigError,
  decryptVaultPayload,
  digestWithPepper,
  encryptWithKey,
  resolveVaultEncryptionKey,
  resolveVaultMatchPepper,
} from "@/lib/vault-crypto";

export const dynamic = "force-dynamic";

/**
 * Owner-only Vault surface (design rules 2 and 5, decisions H1/H5).
 *   GET    — owner's consent state + decrypted entries (always fully visible).
 *   POST   — set/update entries; consent required first (403 otherwise); one
 *            transaction re-encrypts the payload and replaces match keys.
 *   DELETE — one-tap HARD delete of all vault data; idempotent, no undo.
 *
 * A member whose consent_version is stale may still GET/POST/DELETE here —
 * the consent freeze is outbound/inbound visibility only (invariant V-2), so
 * the response carries `consentCurrent` for the UI to prompt re-acceptance.
 * The same-origin guard wraps every mutating handler (request-guard.ts usage
 * convention); the auth guard answers 401/503 exactly like other member
 * routes (see src/app/api/profile/[id]/route.ts).
 */

function vaultConfiguredResponse(): Response {
  return Response.json({ error: "Vault is not configured in this environment." }, { status: 503 });
}

async function resolveMember(request: Request) {
  try {
    return await getMember(request);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const member = await resolveMember(request);
  if (!member) {
    /* Distinguish an auth outage from signed-out, mirroring profile/[id]. */
    try {
      await getMember(request);
      return Response.json({ error: "Not signed in." }, { status: 401 });
    } catch {
      return Response.json({ error: "We couldn't load your private preferences right now. Please try again." }, { status: 503 });
    }
  }

  const [row] = await db.select().from(vaultEntries).where(eq(vaultEntries.userId, member.id)).limit(1);
  if (!row) {
    return Response.json(
      { ok: true, consent: null, entries: {} },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  let entries: Record<string, string>;
  try {
    entries = decryptVaultPayload(row.payload);
  } catch (error) {
    if (error instanceof VaultConfigError) return vaultConfiguredResponse();
    return Response.json(
      { error: "Your private preferences could not be opened. Nothing was changed — please try again." },
      { status: 500 }
    );
  }

  return Response.json(
    {
      ok: true,
      consent: {
        acceptedAt: row.consentAcceptedAt,
        version: row.consentVersion,
        current: row.consentVersion === CONSENT_VERSION,
      },
      entries,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const member = await resolveMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = validateVaultEntries((body as { entries?: unknown } | null)?.entries);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  let encryptionKey: Buffer | null;
  let pepper: Buffer | null;
  try {
    encryptionKey = resolveVaultEncryptionKey();
    pepper = resolveVaultMatchPepper();
  } catch (error) {
    return Response.json(
      { error: error instanceof VaultConfigError ? error.message : "The service hiccuped. Please try again." },
      { status: 503 }
    );
  }
  if (!encryptionKey || !pepper) return vaultConfiguredResponse();

  /* Rule 4: explicit consent must exist BEFORE anything is saved. Fail closed. */
  const [existing] = await db
    .select({ consentVersion: vaultEntries.consentVersion })
    .from(vaultEntries)
    .where(eq(vaultEntries.userId, member.id))
    .limit(1);
  if (!existing) {
    return Response.json({ error: "Consent is required before saving private preferences." }, { status: 403 });
  }

  const payload = encryptWithKey(encryptionKey, parsed.entries);
  const digests = Object.entries(parsed.entries).map(([prefKey, value]) => ({
    userId: member.id,
    prefKey,
    valueDigest: digestWithPepper(pepper, prefKey, value),
  }));

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(vaultEntries)
        .set({ payload, keyVersion: 1, updatedAt: new Date() })
        .where(eq(vaultEntries.userId, member.id));
      await tx.delete(vaultMatchKeys).where(eq(vaultMatchKeys.userId, member.id));
      if (digests.length > 0) await tx.insert(vaultMatchKeys).values(digests);
    });
  } catch {
    return Response.json({ error: "Could not save your private preferences. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true, consentCurrent: existing.consentVersion === CONSENT_VERSION });
}

export async function DELETE(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;

  const member = await resolveMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  try {
    await db.transaction(async (tx) => {
      await tx.delete(vaultMatchKeys).where(eq(vaultMatchKeys.userId, member.id));
      await tx.delete(vaultEntries).where(eq(vaultEntries.userId, member.id));
    });
  } catch {
    return Response.json({ error: "Could not delete your private preferences. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
