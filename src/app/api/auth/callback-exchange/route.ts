import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Server-side PKCE-code exchange (cookie session) for the callback page. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const { code } = (body ?? {}) as { code?: string };
  if (!code) return Response.json({ ok: false }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return Response.json({ ok: false, error: error.message });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
