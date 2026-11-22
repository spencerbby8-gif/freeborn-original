import { AppShell } from "@/components/app/app-shell";
import { SettingsView } from "@/components/app/settings-view";
import Link from "next/link";
export default function Page(){return <AppShell><div className="fb-legacy"><Link href="/app/privacy">← Privacy &amp; Safety</Link><SettingsView initialArea="privacy"/></div></AppShell>;}
