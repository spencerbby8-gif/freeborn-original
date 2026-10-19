import type { Metadata } from "next";
import { HomeDeck } from "@/components/app/home-deck";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Freeborn discovery — full profiles, clear intentions, and values on the table before the first message.",
  /* This page renders HomeDeck, which currently shows real member cards to
     anonymous visitors. It must never appear in a search index: a member's face,
     name, age, city and stated health values showing up in Google results under
     their real name is a privacy harm with no upside. Belt and braces alongside
     the robots.txt disallow. `follow: false` stops link equity flowing onward to
     member-specific URLs. */
  robots: { index: false, follow: false },
};

export default function DiscoverPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-night)] px-5 pb-24 pt-6 text-[var(--color-pearl)]">
      <HomeDeck standalone />
    </div>
  );
}
