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
 * `freeborndating.com` is a registered domain, not a platform subdomain. Verisign
 * handle 3167877741_DOMAIN_COM-VRSN, created 2026-11-13, expires 2027-11-13,
 * registrar DomainRegistry.com LLC (Northwest Registered Agent's free-domain
 * programme), status `active`, WHOIS privacy on, renewal fees covered while the
 * account stays active. Nameservers are ns1/ns2.hosting.businessidentity.llc
 * (PowerDNS), so the operator can edit A, AAAA, CNAME, MX, TXT, SRV and CAA
 * records directly — which is what makes Vercel attachment, a Search Console
 * *domain* property, and SPF/DKIM/DMARC for transactional mail all possible.
 *
 * Owning the apex removes the three caps the previous value had: search authority
 * (no longer a subdomain on a shared apex), DNS-record verification for
 * transactional email, and Vercel's Hobby non-commercial terms.
 *
 * The Vercel default alias `freeborn-umber.vercel.app` remains attached and serves
 * the same deployment; it is no longer canonical. Both origins are present in the
 * Supabase `uri_allow_list`, and `www.freeborndating.com` 308-redirects to the apex
 * so there is exactly one canonical host for crawlers.
 */

/** Canonical origin. No trailing slash. Every public URL derives from this. */
export const SITE_URL = "https://freeborndating.com";

/** Product name, as members see it. */
export const SITE_NAME = "Freeborn";

/**
 * Operator. Freeborn is the product; Coldtruths is the entity that runs it.
 *
 * A privacy policy must identify the data *controller*, which is the operator, not
 * the brand. Keeping the two distinct here means the policy stays correct if the
 * product is ever renamed or a second product is launched under the same operator.
 *
 * Coldtruths Technologies is a trading name, not a registered entity: the operator is
 * a sole proprietorship. When a company is registered, replace OPERATOR_NAME with the
 * registered name and number, set OPERATOR_FORM to that form, correct
 * OPERATOR_FORM_ARTICLE with it, and review GOVERNING_LAW and OPERATOR_COUNTRY at the
 * same time — incorporating changes where the contract is governed, not only what the
 * operator is called.
 */
export const OPERATOR_NAME = "Coldtruths Technologies";
export const OPERATOR_FORM = "sole proprietorship";

/**
 * Indefinite article for OPERATOR_FORM, written down rather than derived.
 *
 * /privacy rendered "operated by Coldtruths, an sole proprietorship" — a grammar error
 * live on the page whose whole job is to look competent enough to be trusted with
 * personal data. Deriving the article from the first letter would fix this case and
 * break the next one: an acronym such as "LLC" takes "an" because it is pronounced
 * "el-el-see", which a first-character test gets exactly backwards. So the article is
 * stated here and reviewed whenever OPERATOR_FORM changes.
 */
export const OPERATOR_FORM_ARTICLE = "a";

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
 * Member-facing contact address, on the app's own domain.
 *
 * Was the operator's personal Gmail, which this file already flagged as interim: legal
 * and privacy correspondence should not land in a personal inbox, and a policy that
 * publishes a free webmail address undercuts the trust the rest of the page is built to
 * earn. The mailbox is hosted on the domain's existing MX
 * (mailserver.businessidentity.llc), so no new DNS record is involved — but the mailbox
 * must exist before this ships, because publishing an address that bounces is worse
 * than the personal one it replaced. Rendered as mailto: five times on /privacy and in
 * clause 15 of /terms.
 */
export const CONTACT_EMAIL = "support@freeborndating.com";

/** Legal document version. Bump on every substantive edit; shown on each page. */
export const LEGAL_VERSION = "1.1";
export const LEGAL_EFFECTIVE_DATE = "13 November 2026";

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
