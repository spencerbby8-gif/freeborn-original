import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SettingsView } from "@/components/app/settings-view";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsView />
    </AppShell>
  );
}
