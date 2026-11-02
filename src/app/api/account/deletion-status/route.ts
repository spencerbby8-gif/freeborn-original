import { getPublicDeletionStatus } from "@/lib/account-deletion";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/deletion-status?token=<random-token>
 *
 * Public, read-only completion probe for a deletion that already removed the
 * auth row. The token is the only input; the response contains no account id,
 * email, object path or error detail.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const status = await getPublicDeletionStatus(token);
  if (!status) return Response.json({ error: "Unknown deletion token." }, { status: 404 });
  return Response.json(
    { ...status, completed: status.status === "completed" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
