import { getMember } from "@/lib/app-auth";
import { acknowledgeCase, recomputeTrust } from "@/lib/identity-resolve";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/safety/cases/ack  { caseId }
 *
 * Acknowledging a warning CLOSES IT and refunds its trust penalty on the next
 * recompute. That is the whole design point of the warning tier: the cheapest
 * possible action that still puts a human on notice, with a way back to zero.
 * Only the subject of their own warning may acknowledge it; suppression and above
 * are not acknowledgeable, they are appealable.
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
  const caseId = (body as { caseId?: unknown })?.caseId;
  if (typeof caseId !== "string" || !UUID.test(caseId)) {
    return Response.json({ error: "A case id is required." }, { status: 400 });
  }

  const res = await acknowledgeCase(member.id, caseId);
  if (!res.ok) {
    const status = res.error === "not-found" ? 404 : res.error === "only-warnings-can-be-acknowledged" ? 409 : 409;
    return Response.json({ error: res.error }, { status });
  }
  try {
    await recomputeTrust(member.id);
  } catch {
    /* the acknowledgement stands even if the score refresh is slow */
  }
  return Response.json({ ok: true, state: "acknowledged" });
}
