import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";

const FALLBACK_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";
const FALLBACK_KEY = "sb_publishable_7N1q-Cnr7bXvBKJQGuG4zg_MCML5bPc";

/**
 * Authenticates an API request against Supabase.
 *
 * Prefers an Authorization: Bearer token (works in any browser context,
 * including iframes where cookies are blocked), then falls back to the
 * SSR cookie session.
 */
export async function createSupabaseClientForApi(
  request: Request
): Promise<SupabaseClient> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      FALLBACK_KEY;
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createSupabaseServerClient();
}
