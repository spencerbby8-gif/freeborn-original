import { AppShell } from "@/components/app/app-shell";
import { SystemInbox } from "@/components/app/system-inbox";
export const metadata = { title: "Freeborn updates", robots: { index: false } };
export default function Page() { return <AppShell><SystemInbox /></AppShell>; }
