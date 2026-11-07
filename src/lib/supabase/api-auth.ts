import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";

/**
 * Authenticates an API request against Supabase.
 *
 * Prefers an Authorization: Bearer token (works in any browser context,
 * including iframes where cookies are blocked), then falls back to the
 * SSR cookie session.
 */
function requireConfig(url: string, anonKey: string) {
  if (!url || !anonKey) {
    throw new Error("Supabase API configuration is missing; refusing to use a production fallback.");
  }
  return { url, anonKey };
}

export async function createSupabaseClientForApi(
  request: Request
): Promise<SupabaseClient> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      "";
    const config = requireConfig(url, anonKey);
    return createClient(config.url, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createSupabaseServerClient();
}

/**
 * A Supabase client that never persists a session.
 *
 * Used to check a member's current password without disturbing the session that
 * authorised the request. Calling signInWithPassword on the request's own client
 * would replace its access and refresh tokens underneath it.
 */
export function createSessionlessSupabaseClient(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";
  const config = requireConfig(url, anonKey);
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
