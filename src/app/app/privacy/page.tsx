import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { PrivacyScreen } from "@/components/prototype/settings";
export const metadata: Metadata = { title: 'Privacy & Safety', robots: { index: false } };
export default function Page() { return <AppShell><PrivacyScreen/></AppShell>; }
