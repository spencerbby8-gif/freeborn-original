import { redirect } from "next/navigation";

/**
 * See sitemap-0.xml/route.ts for the full rationale. /sitemap-1.xml is the
 * same Next.js default-404 artifact; redirect it to the canonical sitemap so
 * Bingbot stops logging a 4xx crawl error for it.
 */
export async function GET() {
  redirect("/sitemap.xml", { status: 301 });
}
