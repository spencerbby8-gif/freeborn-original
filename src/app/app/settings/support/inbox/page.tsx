import { AppShell } from "@/components/app/app-shell";
import { SupportInbox } from "@/components/app/member-communications";
export const metadata={title:'Support inbox',robots:{index:false}};
export default function Page(){return <AppShell><SupportInbox/></AppShell>;}
