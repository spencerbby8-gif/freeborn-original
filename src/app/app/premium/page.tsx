import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { PremiumScreen } from "@/components/prototype/settings";
export const metadata: Metadata = { title: 'Subscription', robots: { index: false } };
export default function Page() { return <AppShell><PremiumScreen/></AppShell>; }
