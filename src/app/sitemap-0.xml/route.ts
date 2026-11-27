import { redirect } from "next/navigation";

/**
 * B21: Next.js serves a default 404 for /sitemap-0.xml and /sitemap-1.xml when
 * no split-sitemap config exists, even though only one sitemap is published.
 * Bingbot discovered /sitemap.xml and, expecting possible sitemap splits, tried
 * /sitemap-0.xml and /sitemap-1.xml — both returned 404, logging one crawl error
 * in Bing Webmaster (GetCrawlStats, 2026-11-26, Code4xx=1).
 *
 * There is exactly one sitemap. Redirecting the split-name variants to the
 * canonical /sitemap.xml tells every crawler the authoritative sitemap location
 * and removes the 404, with no duplicate-content or canonical ambiguity.
 */
export async function GET() {
  redirect("/sitemap.xml", { status: 301 });
}
