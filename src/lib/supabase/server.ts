import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const FALLBACK_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";
const FALLBACK_KEY = "sb_publishable_7N1q-Cnr7bXvBKJQGuG4zg_MCML5bPc";

function resolveConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    FALLBACK_KEY;
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = resolveConfig();

  return createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: "none",
      secure: true,
      path: "/",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies directly.
          // The middleware refreshes auth cookies on the request boundary.
        }
      },
    },
  });
}
