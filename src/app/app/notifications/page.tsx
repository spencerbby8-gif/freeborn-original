import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { NotificationsScreen } from "@/components/prototype/notifications";

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

export default async function NotificationsPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const {view}=await searchParams;
  return (
    <AppShell>
      <NotificationsScreen initialView={view==='matches'?'match':'all'}/>
    </AppShell>
  );
}
