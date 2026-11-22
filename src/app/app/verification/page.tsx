import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { VerificationScreen } from "@/components/prototype/screens";
export const metadata: Metadata = { title: 'Verification', robots: { index: false } };
export default function Page() { return <AppShell><VerificationScreen/></AppShell>; }
