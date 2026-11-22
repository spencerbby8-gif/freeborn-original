import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SettingsScreen } from "@/components/prototype/settings";
export const metadata: Metadata = { title: 'Settings', robots: { index: false } };
export default function Page() { return <AppShell><SettingsScreen/></AppShell>; }
