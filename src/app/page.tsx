import type { Metadata } from "next";
import { headers } from "next/headers";
import { DeletionNotice } from "@/components/landing/deletion-notice";
import { PremiumLanding } from "@/components/landing/premium/premium-landing";
import { landingFaqs } from "@/components/landing/premium/landing-faqs";

/**
 * Landing page metadata.
 *
 * Only `alternates` is set here; title, description, keywords and the Open Graph
 * block are inherited from the root layout. The canonical is declared per page
 * rather than sitewide so that non-indexable routes do not inherit it and claim to
 * be duplicates of the homepage. See the comment in src/app/layout.tsx.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Structured data for the landing page.
 *
 * `WebSite` and `Organization` are emitted sitewide from `src/app/layout.tsx`.
 * The FAQ markup is derived from the same `landingFaqs` array that renders the
 * visible FAQ section, so the JSON-LD and the page cannot drift apart.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: landingFaqs.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

export default async function LandingPage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div className="lp-page">
      <DeletionNotice />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PremiumLanding />
    </div>
  );
}
