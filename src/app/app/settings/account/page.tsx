import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AccountScreen } from "@/components/prototype/account";
export const metadata: Metadata = { title: 'Account', robots: { index: false } };
export default function Page() { return <AppShell><AccountScreen/></AppShell>; }
