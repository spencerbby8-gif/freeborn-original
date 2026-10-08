import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { securityEvents, suspensions } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { checkIpReputation, clientIp } from "@/lib/ip-reputation";

export const dynamic = "force-dynamic";

/**
 * POST /api/security/check — the door.
 * Called right after a member passes authentication. Datacenter/hosting
 * traffic gets suspended on the spot and bounced back to the auth screen;
 * VPN/proxy traffic is recorded but allowed (privacy-minded members are
 * Freeborn's own people).
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const ip = clientIp(request);

  /* Already suspended? Every retry hears the policy. */
  const [existing] = await db
    .select()
    .from(suspensions)
    .where(eq(suspensions.email, member.email.toLowerCase()))
    .orderBy(desc(suspensions.createdAt))
    .limit(1);
  if (existing?.active) {
    return Response.json({ suspended: true, reason: existing.reason });
  }

  const verdict = await checkIpReputation(ip);

  if (verdict.proxy && !verdict.datacenter) {
    await db.insert(securityEvents).values({
      email: member.email.toLowerCase(),
      ip,
      kind: "proxy-observed",
      detail: verdict.isp ?? null,
    });
  }

  if (verdict.datacenter) {
    await db.insert(securityEvents).values({
      email: member.email.toLowerCase(),
      ip,
      kind: "datacenter-blocked",
      detail: verdict.isp ?? null,
    });
    await db.insert(suspensions).values({
      email: member.email.toLowerCase(),
      ip,
      reason: "privacy_policy",
    });
    return Response.json({ suspended: true, reason: "privacy_policy" });
  }

  return Response.json({ suspended: false });
}
