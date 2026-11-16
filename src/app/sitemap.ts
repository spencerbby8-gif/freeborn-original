import type { MetadataRoute } from "next";
import { absolute, INDEXABLE_PATHS } from "@/lib/site";
import { fetchQualifyingCities } from "@/lib/city-pages";

/* Request-time, cached one hour. The editorial entries are static truth, but
   the gated city entries (B18) come from the live member count, and a sitemap
   frozen at build time would either publish cities that no longer qualify or
   hide ones that do. force-dynamic also keeps `next build` (CI, no database)
   from ever needing a connection: the query runs on first request, not at
   build. */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Freeborn sitemap — every INDEXABLE public page.
 *
 * Two bugs this replaces:
 *
 * 1. Every URL pointed at `https://freeborn.app`, a domain Freeborn does not own
 *    (it serves an unrelated site titled "Freeborn - Your privacy, your control").
 *    The live sitemap.xml was submitting four of a stranger's URLs to Google and
 *    sending ranking signals to them. URLs now derive from the canonical constant.
 *
 * 2. The entries contradicted the pages' own robots metadata. `/auth` and
 *    `/appeal` were submitted here at priority 0.7 and 0.3 while both page files
 *    set `robots: { index: false }`. Google treats sitemap-plus-noindex as a
 *    conflict and drops the URL, so those two entries did nothing except signal
 *    that the sitemap could not be trusted. Both are gone.
 *
 * Also fixed: `/#safety` was listed instead of `/safety`. Search engines ignore
 * fragment identifiers, so that entry resolved to the homepage and the real Safety
 * page — the strongest trust content on the site, and already marked
 * `index: true, follow: true` — was never submitted at all.
 *
 * Anything added here must also be allowed in `robots.ts` and must NOT carry
 * `index: false` in its own metadata. `INDEXABLE_PATHS` in `@/lib/site` is the
 * shared list that keeps the three in agreement.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /* lastmod is the date the visible copy last changed, carried per path in
     INDEXABLE_PATHS — not the build timestamp. A sitemap whose lastmod flips on
     every deploy tells crawlers everything changed today, which Google's sitemap
     guidance treats as noise and eventually ignores; a truthful lastmod is one of
     the few crawl-budget signals a small site actually controls. */
  void now;
  const editorial = INDEXABLE_PATHS.map(({ path, priority, changeFrequency, lastModified }) => ({
    url: absolute(path),
    lastModified: new Date(`${lastModified}T00:00:00.000Z`),
    changeFrequency,
    priority,
  }));
  /* City pages carry NO lastmod on purpose: their content is a live count, and
     stamping any fixed date on them would be the same false precision B13
     removed from the editorial entries. A database failure degrades to the
     editorial list rather than a broken sitemap. */
  const cities = await fetchQualifyingCities().catch(() => []);
  return [
    ...editorial,
    ...cities.map((c) => ({
      url: absolute(c.path),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
