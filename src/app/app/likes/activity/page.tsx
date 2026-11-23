import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { ActivityScreen } from "@/components/prototype/account-extras";
export const metadata: Metadata = { title: 'Your likes', robots: { index: false } };
export default function Page() { return <AppShell><ActivityScreen/></AppShell>; }
