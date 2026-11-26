import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;

/** Account-owned notices, newest first, with lossless microsecond keyset pagination. */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const cursor = new URL(request.url).searchParams.get("cursor");
  let when: string | undefined, id: string | undefined;
  if (cursor) {
    const parts = cursor.split("|");
    if (parts.length !== 2 || !timestampPattern.test(parts[0]) || Number.isNaN(Date.parse(parts[0])) || new Date(parts[0]).toISOString().slice(0,19) !== parts[0].slice(0,19) || !isUuid(parts[1]))
      return Response.json({ error: "Invalid notice cursor." }, { status: 400 });
    [when, id] = parts;
  }
  try {
    const boundary = when && id ? sql`and (created_at,id) < (${when}::timestamptz,${id}::uuid)` : sql``;
    const { rows } = await db.execute<{id:string;kind:string;title:string;body:string;href:string;created_at:Date;read_at:Date|null;cursor_time:string}>(sql`
      select id,kind,title,body,href,created_at,read_at,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_time
      from public.member_notices where user_id=${member.id}::uuid ${boundary}
      order by created_at desc,id desc limit 51`);
    const { rows: [count] } = await db.execute<{n:number}>(sql`select count(*)::int n from public.member_notices where user_id=${member.id}::uuid and read_at is null`);
    const hasMore = rows.length > 50, page = rows.slice(0, 50), last = page.at(-1);
    return Response.json({ notices: page.map(({cursor_time: _cursor, ...row})=>row), unreadCount: count.n,
      nextCursor: hasMore && last ? `${last.cursor_time}|${last.id}` : null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Your updates could not be loaded." }, { status: 503 });
  }
}

/** Idempotent and owner-scoped. Do not reveal whether another account's ID exists. */
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  let id: unknown;
  try { ({ id } = await request.json()); } catch { /* invalid below */ }
  if (!isUuid(id)) return Response.json({ error: "Invalid notice." }, { status: 400 });
  try {
    await db.execute(sql`update public.member_notices set read_at=coalesce(read_at,now()) where id=${id}::uuid and user_id=${member.id}::uuid`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not mark this update read." }, { status: 503 });
  }
}
