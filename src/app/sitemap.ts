import type { MetadataRoute } from "next";
import { absolute, INDEXABLE_PATHS } from "@/lib/site";

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
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return INDEXABLE_PATHS.map(({ path, priority, changeFrequency }) => ({
    url: absolute(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
