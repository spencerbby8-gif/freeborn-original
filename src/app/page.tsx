import "@/components/landing/landing.css";
import { Nav } from "@/components/landing/nav";
import { DeletionNotice } from "@/components/landing/deletion-notice";
import { Hero } from "@/components/landing/hero";
import { Room } from "@/components/landing/room";
import { HowItWorks } from "@/components/landing/how";
import { Safety } from "@/components/landing/safety";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { faqs } from "@/components/landing/faq";

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
 * `WebSite` and `Organization` are emitted sitewide from `src/app/layout.tsx`
 * against the canonical constant, so they are NOT repeated here. Emitting the same
 * two entities twice, with two different `url` values, is how the earlier version
 * ended up attributing the site to https://freeborn.app, a domain Freeborn does not
 * own.
 *
 * The FAQ markup is derived from the exported `faqs` array that renders the visible
 * FAQ section, because Google requires FAQ structured data to match content on the
 * page. The previous hand-written copy had drifted entirely out of sync with it.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

async function LandingStructuredData(){
  const nonce=(await headers()).get('x-nonce')??undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd)}}/>;
}

// Do not suspend the public content behind the app's fullscreen route loader.
// Only nonce-dependent structured data needs to await request headers here.
export default function LandingPage() {
  return (
    <div className="landing-page">
      <Suspense fallback={null}><LandingStructuredData/></Suspense>
      <Nav />
      <DeletionNotice />
      <main>
        <Hero />
        <Room />
        <HowItWorks />
        <Safety />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
