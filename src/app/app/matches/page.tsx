import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { MatchesScreen } from "@/components/prototype/screens";
export const metadata: Metadata = { title: 'Matches', robots: { index: false } };
export default function Page() { return <AppShell><MatchesScreen/></AppShell>; }
