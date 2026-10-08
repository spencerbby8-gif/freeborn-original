import type { MetadataRoute } from "next";

/**
 * Robots policy — invite every major crawler to the public pages, keep the
 * private app (profiles, chats, onboarding) out of search entirely.
 */
export default function robots(): MetadataRoute.Robots {
  const base = "https://freeborn.app";
  return {
    rules: [
      {
        userAgent: ["Googlebot", "Bingbot", "DuckDuckBot", "Applebot", "facebookexternalhit", "Twitterbot", "*"],
        allow: ["/", "/auth", "/appeal"],
        disallow: ["/app", "/app/", "/onboarding", "/api/", "/discover"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
