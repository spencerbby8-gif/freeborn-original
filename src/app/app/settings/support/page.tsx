import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SupportScreen } from "@/components/prototype/account-extras";
export const metadata: Metadata = { title: 'Help & Support', robots: { index: false } };
export default function Page() { return <AppShell><SupportScreen/></AppShell>; }
