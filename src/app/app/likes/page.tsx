import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { LikesView } from "@/components/app/likes-view";

export const metadata: Metadata = { title: "Likes", robots: { index: false } };

export default function LikesPage() {
  return (
    <AppShell>
      <LikesView />
    </AppShell>
  );
}
