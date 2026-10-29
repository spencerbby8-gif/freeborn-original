import { getMember } from "@/lib/app-auth";
import { listLiveCases } from "@/lib/identity-resolve";
import { nextStepFor, type Tier } from "@/lib/moderation-policy";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/safety/cases — the member's own open enforcement cases.
 *
 * Tinder's client shows an appealable-ban screen driven by `GET /v1/appeals/cases` and
 * clears warnings with `POST /v1/case/warnings/acknowledge`. Both halves matter: an
 * enforcement tier with no visible status and no exit is indistinguishable from a silent
 * shadowban, and that is the single most common trust-destroying failure in this product
 * category. So: tell the member what is open, tell them the one step available to them,
 * and give them the deadline.
 */
export async function GET(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const rows = await listLiveCases(member.id);
  const cases = rows.map((c) => ({
    id: c.id,
    tier: c.tier,
    state: c.state,
    /* `code` is deliberately NOT returned: telling a member "photo_reused_across_accounts"
       names the detector, which is the thing a duplicate-operator needs least. */
    message: c.notes,
    createdAt: c.createdAt,
    dueAt: c.dueAt,
    acknowledgedAt: c.acknowledgedAt,
    ...nextStepFor(c.tier as Tier, true),
  }));
  return Response.json(
    { cases, suppressed: cases.some((c) => c.tier === "suppression") },
    { headers: { "cache-control": "private, no-store" } }
  );
}
