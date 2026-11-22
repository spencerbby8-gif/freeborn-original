import { AppShell } from "@/components/app/app-shell";
import { SettingsView } from "@/components/app/settings-view";
import Link from "next/link";
export default function Page(){return <AppShell><div className="fb-legacy"><Link href="/app/settings">← Settings</Link><SettingsView initialArea="account"/></div></AppShell>;}
