import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Robots policy — invite every major crawler to the public pages, keep the
 * private app (profiles, chats, onboarding) out of search entirely.
 *
 * The sitemap URL is derived from the single canonical constant in `@/lib/site`.
 * It used to be hardcoded here as `https://freeborn.app`, a domain Freeborn does
 * not own, which pointed every crawler at a stranger's website.
 *
 * WHY /discover STAYS DISALLOWED
 * ------------------------------
 * `/discover` is a public preview that renders real member cards: names, ages,
 * cities, photos and prompts. Letting a search engine index that turns every
 * member's dating profile into a searchable public record, indexed under their
 * real name, forever. That is a privacy harm with no upside — the traffic a
 * preview page earns is worth nothing against a member finding their own face in
 * Google results. The page is still reachable by humans following a link; it is
 * simply not offered to crawlers.
 *
 * `INDEXABLE_PATHS` in `@/lib/site` and this file must stay in step. A page in the
 * sitemap that carries `index: false` on the page itself is a contradiction Google
 * resolves by dropping the URL, which is what was happening to `/auth` and
 * `/appeal`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "DuckDuckBot",
          "Applebot",
          "facebookexternalhit",
          "Twitterbot",
          "*",
        ],
        allow: ["/"],
        /* CORRECTION to an earlier draft of this file, which also disallowed /auth
           and /appeal. That was wrong. A `Disallow` stops a crawler fetching the
           page, which means the crawler never sees the `noindex` meta tag those
           pages carry, and Google is then free to index the bare URL with no
           content. The standard pattern is to allow the crawl and let the page's
           own robots metadata do the work, so both are allowed here and both keep
           `index: false` in their page metadata.

           /discover is the exception and stays disallowed, because it currently
           renders real member cards to anonymous visitors. For that page, keeping
           member data away from a crawler outranks index hygiene, and the footer
           link to it has been removed so the URL is not handed to crawlers in the
           first place. Once /discover renders illustrative sample data instead of
           live members it can be allowed, noindexed explicitly, or even indexed as
           a marketing page. That decision belongs with the B6 work. */
        disallow: ["/app", "/app/", "/onboarding", "/api/", "/discover"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
