import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { observeDevice, recordDeviceFanout, recomputeTrust } from "@/lib/identity-resolve";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/device/self  { installId, installAgeMs? }
 *
 * The free, non-fingerprinting half of Tinder's `persistent-device-id`. The client
 * generates a random id once and keeps sending it; we store only a 64-bit hash.
 * What the server learns is the linkage graph: how many accounts ride one device.
 *
 * What we deliberately do NOT do: we never derive an id from canvas/WebGL/audio or
 * any other passive signal, so there is nothing here that tracks a person who clears
 * their storage and says nothing. The cost is honest and stated: a determined operator
 * can reset this id, exactly as a determined operator can buy a phone. That is why this
 * signal can only open a WARNING, never a suppression (see moderation-policy CODE_TIER).
 */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = (body ?? {}) as { installId?: unknown; installAgeMs?: unknown };
  const installId = typeof b.installId === "string" ? b.installId : null;
  const installAgeMs = typeof b.installAgeMs === "number" ? b.installAgeMs : null;
  if (!installId) return Response.json({ error: "installId is required." }, { status: 400 });

  const [acct] = await db
    .select({ createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.email, member.email.toLowerCase()))
    .limit(1);

  const fact = await observeDevice(member.id, installId, {
    installAgeMs,
    accountCreatedAt: acct?.createdAt ?? null,
  });
  if (!fact) return Response.json({ accepted: false, reason: "install-id-rejected" });

  await recordDeviceFanout(member.id, fact.accountsOnDevice);
  try {
    await recomputeTrust(member.id);
  } catch {
    /* score refresh is best-effort here */
  }

  return Response.json(
    {
      accepted: true,
      /* We tell the member only that the device is recorded and how many accounts
         share it. We do not echo a hash or an id back: it would be a cookie in JSON. */
      accountsOnThisDevice: fact.accountsOnDevice,
      flaggedForReview: fact.suspendedCoTenants > 0,
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
