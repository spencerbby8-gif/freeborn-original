import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { NotificationSettingsScreen } from "@/components/prototype/settings";
export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export default function Page() { return <AppShell><NotificationSettingsScreen/></AppShell>; }
