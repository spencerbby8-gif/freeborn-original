import { absolute, SITE_NAME } from "@/lib/site";

/**
 * Page-level structured data for an indexable public page: a `WebPage` entity
 * plus the `BreadcrumbList` that earns breadcrumb treatment in search results.
 *
 * WHY THIS EXISTS (B13, 2026-11-15). The crawler-facing HTML of the platforms
 * that dominate search wraps every content page in page-level entities and a
 * breadcrumb list — TikTok serves Googlebot `ProfilePage`/`VideoObject` plus
 * `BreadcrumbList` on a profile, and Google's own documentation pages carry
 * `BreadcrumbList` alongside their og set. Freeborn's subpages carried only the
 * sitewide `Organization` + `WebSite`, so a /privacy or /safety hit in search had
 * no entity describing THE PAGE and no path back to the root.
 *
 * Nothing here is invented, in keeping with the sitewide structured-data rule in
 * layout.tsx: the name and description are the page's own metadata strings, the
 * breadcrumb is literally Home -> this page, and `isPartOf` points at the same
 * WebSite entity the layout already emits (by URL, not by duplicating it).
 */
export function PageStructuredData({
  path,
  name,
  description,
}: {
  path: string;
  name: string;
  description: string;
}) {
  const url = absolute(path);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": url,
      url,
      name,
      description,
      isPartOf: { "@type": "WebSite", url: absolute("/"), name: SITE_NAME },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: absolute("/") },
        { "@type": "ListItem", position: 2, name, item: url },
      ],
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\u003c") }}
    />
  );
}
