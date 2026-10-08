import type { MetadataRoute } from "next";

/**
 * Freeborn sitemap — every INDEXABLE public page. The TikTok-style lesson
 * applied: every unit of content that deserves search traffic gets its own
 * indexable, server-rendered URL with clean metadata. Private app pages
 * stay OUT of search on purpose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://freeborn.app";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/#safety`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/auth`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/appeal`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
