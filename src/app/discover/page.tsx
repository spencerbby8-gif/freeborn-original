import type { Metadata } from "next";
import { HomeDeck } from "@/components/app/home-deck";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Freeborn discovery: full profiles, clear intentions, and values on the table before the first message.",
  /* This page renders HomeDeck. Since B6 the deck answers a signed-out visitor
     with "The room is for members" rather than member cards, so the harm this
     directive was written to prevent no longer happens here. It stays anyway: it
     is one line of defence in depth against a future change that puts real
     faces, ages, cities and health views back on an indexable page, and a
     robots.txt disallow is only advisory. `follow: false` also stops link equity
     flowing onward to member-specific URLs. */
  robots: { index: false, follow: false },
};

export default function DiscoverPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-night)] px-5 pb-24 pt-6 text-[var(--color-pearl)]">
      <HomeDeck standalone />
    </div>
  );
}
