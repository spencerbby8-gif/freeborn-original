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

  /* PREVIEW-ONLY QA allowlist — INERT IN PRODUCTION, BY CONSTRUCTION.
   *
   * Owner-authorised QA drives the app from a sandbox whose egress IP is a
   * datacenter range, which this door suspends on sight (correct policy for
   * the shipped product). To keep QA able to reach the authenticated app on
   * Preview deployments only, emails listed in QA_SECURITY_BYPASS_EMAILS skip
   * the door when VERCEL_ENV === "preview". The guard is a runtime equality
   * check against "preview", so a production deployment can never enter this
   * branch even if the variable were ever set there. No production policy,
   * logging or suspension behaviour changes. */
  if (process.env.VERCEL_ENV === "preview") {
    const qaEmails = (process.env.QA_SECURITY_BYPASS_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (qaEmails.includes(member.email.toLowerCase())) {
      return Response.json({ suspended: false, qaBypass: true });
    }
  }

  const ip = clientIp(request);

  /* Preview-only QA lane. Automated preview acceptance runs originate from
   * datacenter IPs by nature; without this lane they would suspend the QA
   * accounts they sign in with. The env var is scoped to preview targets in
   * Vercel and does not exist in production, so shipped behaviour is
   * untouched. */
  const qaLane = (process.env.QA_SECURITY_BYPASS_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (
    process.env.VERCEL_ENV === "preview" &&
    qaLane.includes(member.email.toLowerCase())
  ) {
    return Response.json({ suspended: false, qaLane: true });
  }

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
