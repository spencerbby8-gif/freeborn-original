import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { HomeDeck } from "@/components/app/home-deck";

export const metadata: Metadata = {
  title: "Discover",
  robots: { index: false },
};

/* Discover is mounted inside the proto skin: `.fb-proto` on this wrapper is what
   activates every lifted prototype rule (serif display type, cards, chips,
   action row) without leaking them into the rest of the site. */
export default function AppDiscoverPage() {
  return (
    <AppShell>
      <div className="fb-proto">
        <HomeDeck />
      </div>
    </AppShell>
  );
}
