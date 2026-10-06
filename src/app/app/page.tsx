import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { HomeDeck } from "@/components/app/home-deck";

export const metadata: Metadata = {
  title: "Discover",
  robots: { index: false },
};

export default function AppDiscoverPage() {
  return (
    <AppShell>
      <HomeDeck />
    </AppShell>
  );
}
