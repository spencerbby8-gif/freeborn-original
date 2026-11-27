import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // B21: Next.js serves a default 404 for /sitemap-0.xml and /sitemap-1.xml
  // even though only one sitemap is published (no split-sitemap config).
  // Bingbot expects possible sitemap splits and tried both variants, logging
  // one 4xx crawl error (GetCrawlStats 2026-11-26, Code4xx=1).
  //
  // Permanent 301 redirects point crawlers at the canonical /sitemap.xml,
  // removing the 404 and preserving the authoritative sitemap URL with no
  // duplicate-content ambiguity.
  async redirects() {
    return [
      { source: "/sitemap-0.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/sitemap-1.xml", destination: "/sitemap.xml", permanent: true },
    ];
  },
};

export default nextConfig;
