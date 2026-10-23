/**
 * UUID validation for dynamic route segments.
 *
 * Both `/api/profile/[id]` and `/api/chat/media/[id]` interpolate the segment
 * straight into a Postgres `uuid` column. A malformed value makes Postgres throw
 * `invalid input syntax for type uuid`, which surfaced as an unhandled 500.
 *
 * Measured live before this guard existed:
 *   GET /api/profile/not-a-uuid       -> 500
 *   GET /api/chat/media/not-a-uuid    -> 401 (auth runs first, so the 500 was
 *                                        only reachable by a signed-in member)
 *
 * Validating first turns that into a correct 400 and keeps malformed input from
 * reaching the database at all.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Standard 400 for a malformed route segment. Deliberately generic: echoing the
 * offending value back would let a caller confirm how far parsing got.
 */
export function badIdResponse() {
  return Response.json({ error: "Malformed identifier." }, { status: 400 });
}
