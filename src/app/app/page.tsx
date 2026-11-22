import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { DiscoverScreen } from "@/components/prototype/screens";
export const metadata: Metadata = { title: 'Discover', robots: { index: false } };
export default function Page() { return <AppShell><DiscoverScreen/></AppShell>; }
