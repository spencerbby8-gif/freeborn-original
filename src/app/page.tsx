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

export default function LandingPage() {
  return (
    <>
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
