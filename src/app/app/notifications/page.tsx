import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { NotificationsView } from "@/components/app/notifications-view";

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <AppShell>
      <NotificationsView />
    </AppShell>
  );
}
