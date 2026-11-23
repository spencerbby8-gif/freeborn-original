import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { MyProfileScreen } from "@/components/prototype/screens";
export const metadata: Metadata = { title: 'Profile', robots: { index: false } };
export default function Page() { return <AppShell><MyProfileScreen/></AppShell>; }
