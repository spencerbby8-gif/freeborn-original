/**
 * Single source of truth for Freeborn's public identity and canonical origin.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this, the canonical URL was hardcoded independently in three places
 * (`layout.tsx` metadataBase, `robots.ts` base, `sitemap.ts` base) and all three
 * said `https://freeborn.app` — a domain Freeborn does not own. It resolves to an
 * unrelated site titled "Freeborn - Your privacy, your control", hosted on
 * Cloudflare. Verified 2026-10-19.
 *
 * The consequence was that the live `sitemap.xml` submitted four URLs belonging to
 * a stranger's domain, and every relative canonical and Open Graph URL Next.js
 * generated resolved against that domain. Search engines were being told the
 * authoritative copy of Freeborn lives somewhere else.
 *
 * Three files could not drift apart again if there is only one constant. Changing
 * the canonical host later is a one-line edit here, plus the Supabase `site_url`
 * and `uri_allow_list`, plus the 301 on the retired host.
 *
 * NOTE ON THE CURRENT VALUE
 * -------------------------
 * `freeborn-umber.vercel.app` is the Vercel project's default domain on a Hobby
 * plan. It works, but it caps three things: search authority (a subdomain on a
 * shared apex), Resend domain verification for transactional email (you cannot add
 * DNS records to a domain you do not own), and Vercel's Hobby terms, which are for
 * non-commercial use. Swap this constant the day a real domain is registered.
 */

/** Canonical origin. No trailing slash. Every public URL derives from this. */
export const SITE_URL = "https://freeborn-umber.vercel.app";

/** Product name, as members see it. */
export const SITE_NAME = "Freeborn";

/**
 * Operator. Freeborn is the product; Coldtruths is the entity that runs it.
 *
 * A privacy policy must identify the data *controller*, which is the operator, not
 * the brand. Keeping the two distinct here means the policy stays correct if the
 * product is ever renamed or a second product is launched under the same operator.
 *
 * Coldtruths is currently an unregistered sole proprietorship. Once a company is
 * registered, replace this string with the registered name and number, and update
 * the "Who runs Freeborn" section of /privacy to match.
 */
export const OPERATOR_NAME = "Coldtruths";
export const OPERATOR_FORM = "sole proprietorship";

/**
 * Governing law for the Terms of Service.
 *
 * The operator is based in Nigeria, so Nigerian law governs the contract. The Terms
 * preserve mandatory consumer rights in the member's own country regardless, which is
 * both the correct position and the one that is enforceable: a choice-of-law clause
 * cannot strip a consumer of protections their home law makes non-waivable (Rome I
 * Article 6(2) in the EU and UK, and equivalent rules elsewhere).
 *
 * If the operator relocates or incorporates, change this one constant and review the
 * "Governing law" clause. If a company is registered, OPERATOR_NAME and
 * OPERATOR_FORM must change too.
 */
export const GOVERNING_LAW = "the Federal Republic of Nigeria";
export const OPERATOR_COUNTRY = "Nigeria";

/**
 * Member-facing contact address.
 *
 * INTERIM VALUE. This is the operator's existing public address (it already appears
 * in git commit metadata on a public repository, so publishing it here discloses
 * nothing new). Replace it with a dedicated address — privacy@yourdomain once a
 * domain exists, or a purpose-made mailbox before then — so that legal and privacy
 * correspondence does not land in a personal inbox.
 */
export const CONTACT_EMAIL = "spencerbby8@gmail.com";

/** Legal document version. Bump on every substantive edit; shown on each page. */
export const LEGAL_VERSION = "1.0";
export const LEGAL_EFFECTIVE_DATE = "19 October 2026";

/** Minimum membership age. Mirrors MIN_AGE in `src/lib/age.ts`. */
export const MIN_AGE = 18;

/** Absolute URL helper. `absolute("/safety")` -> "https://…/safety". */
export function absolute(path: string = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  const joined = `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  /* Strip a trailing slash from the origin root.

     Next.js renders canonical URLs with its default `trailingSlash: false`, so the
     homepage canonical comes out as `https://host` while this helper produced
     `https://host/`. The sitemap entry and the page's own canonical then disagreed
     by one character, and search engines treat those as two different URLs for the
     same page. Normalising here makes the sitemap, og:url, the robots Host
     directive and every canonical agree exactly. */
  return joined === `${SITE_URL}/` ? SITE_URL : joined;
}

/**
 * The pages search engines are allowed to index.
 *
 * Deliberately excludes:
 *  - `/app/*` and `/onboarding` — private, behind auth
 *  - `/auth` — a sign-in form earns nothing and carries `index: false`
 *  - `/appeal` — a suspension appeal form, and it carries `index: false`
 *  - `/discover` — renders real member cards. Indexing members' faces, names and
 *    locations into a search engine is a privacy harm, not a traffic win. The
 *    source comment in `sitemap.ts` previously described this page as built to earn
 *    search traffic; that intent is wrong for a page showing real people, and
 *    `robots.ts` already disallowed it. Both files now agree.
 *
 * Adding a page here without adding matching `robots` metadata is how the earlier
 * sitemap-vs-noindex contradiction happened. Keep the two in step.
 */
export const INDEXABLE_PATHS = [
  { path: "/", priority: 1, changeFrequency: "weekly" as const },
  { path: "/safety", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/privacy", priority: 0.4, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.4, changeFrequency: "yearly" as const },
  { path: "/cookies", priority: 0.2, changeFrequency: "yearly" as const },
];
