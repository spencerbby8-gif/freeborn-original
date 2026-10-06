import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Freeborn Supabase project config.
 *
 * The publishable key is PUBLIC by design (the client-facing key Supabase
 * ships for exactly this purpose — the same value the Vercel build embeds via
 * NEXT_PUBLIC_SUPABASE_ANON_KEY). Inlined as a fallback so a preview rebuild
 * that drops .env can never break authentication.
 *
 * Sessions persist in localStorage (SPA mode): this survives the preview's
 * cross-site iframe even in browsers that block third-party cookies.
 */
const FALLBACK_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";
const FALLBACK_KEY = "sb_publishable_7N1q-Cnr7bXvBKJQGuG4zg_MCML5bPc";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  FALLBACK_KEY;

export const isWebSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // the callback page exchanges codes explicitly
      flowType: "pkce",
    },
  });
  return cached;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
