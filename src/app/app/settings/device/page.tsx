import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { DeviceScreen } from "@/components/prototype/account-extras";
export const metadata: Metadata = { title: 'Device preferences', robots: { index: false } };
export default function Page() { return <AppShell><DeviceScreen/></AppShell>; }
