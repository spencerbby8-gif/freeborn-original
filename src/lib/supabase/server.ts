import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function resolveConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = resolveConfig();
  if (!url || !anonKey) {
    throw new Error("Supabase server configuration is missing; refusing to use a production fallback.");
  }

  return createServerClient(url, anonKey, {
    cookieOptions: {
      sameSite: process.env.FREEBORN_ALLOW_CROSS_SITE_COOKIES === "1" ? "none" : "lax",
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
