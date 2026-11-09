import { createServerClient } from "@supabase/ssr";

function resolveConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    "";
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  /* Imported here rather than at module scope on purpose. `next/headers` only
     exists inside a Next.js request, and a top-level import drags it into every
     bundle that merely reaches this module — including the plain-Node trust
     harnesses, where the subpath does not resolve and the whole bundle fails to
     load. Nothing below runs outside a request in any case. */
  const { cookies } = await import("next/headers");
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
