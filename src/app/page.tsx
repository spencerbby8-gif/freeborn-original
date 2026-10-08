import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Room } from "@/components/landing/room";
import { Manifesto, Marquee } from "@/components/landing/story";
import { HowItWorks } from "@/components/landing/how";
import { Standard } from "@/components/landing/standard";
import { Safety } from "@/components/landing/safety";
import { WhyFreeborn } from "@/components/landing/why-freeborn";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

/** Structured data for Google/Bing — organization + site + FAQ, the
    search-console-ready layer. */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Freeborn",
    url: "https://freeborn.app",
    description:
      "Freeborn is the relationship platform for people who value health autonomy, natural living, and intentional long-term commitment.",
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Freeborn",
    url: "https://freeborn.app",
    slogan: "Date Like You Mean It",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Freeborn?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Freeborn is a values-aligned dating platform for people who prioritize health autonomy, natural living, and intentional relationships — with real identity verification and privacy by default.",
        },
      },
      {
        "@type": "Question",
        name: "Is Freeborn free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes — matching, chatting, photos, and voice notes are free. No paywall hides the basics.",
        },
      },
      {
        "@type": "Question",
        name: "How does Freeborn keep profiles real?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Pose-mimic selfie verification, dual-engine moderation, datacenter-IP blocking, and reports reviewed by both AI and humans.",
        },
      },
    ],
  },
];

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main>
        <Hero />
        <Room />
        <Marquee />
        <Manifesto />
        <HowItWorks />
        <Standard />
        <Safety />
        <WhyFreeborn />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
