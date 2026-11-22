import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AudienceScreen } from "@/components/prototype/account-extras";
export const metadata: Metadata = { title: 'Audience & blocked members', robots: { index: false } };
export default function Page() { return <AppShell><AudienceScreen/></AppShell>; }
