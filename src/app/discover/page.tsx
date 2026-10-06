import type { Metadata } from "next";
import { HomeDeck } from "@/components/app/home-deck";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Freeborn discovery — full profiles, clear intentions, and values on the table before the first message.",
};

export default function DiscoverPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--color-night)] px-5 pb-24 pt-6 text-[var(--color-pearl)]">
      <HomeDeck standalone />
    </div>
  );
}
