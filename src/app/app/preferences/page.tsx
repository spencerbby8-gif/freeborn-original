import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { PreferencesScreen } from "@/components/prototype/settings";
export const metadata: Metadata = { title: 'Discovery Preferences', robots: { index: false } };
export default function Page() { return <AppShell><PreferencesScreen/></AppShell>; }
