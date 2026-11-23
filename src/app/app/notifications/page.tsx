import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { NotificationsScreen } from "@/components/prototype/notifications";

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <AppShell>
      <NotificationsScreen />
    </AppShell>
  );
}
