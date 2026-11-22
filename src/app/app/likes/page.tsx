import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { LikesScreen } from "@/components/prototype/screens";
export const metadata: Metadata = { title: 'Likes', robots: { index: false } };
export default function Page() { return <AppShell><LikesScreen/></AppShell>; }
