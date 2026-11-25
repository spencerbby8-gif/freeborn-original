import { AppShell } from "@/components/app/app-shell";
import { WelcomeScreen } from "@/components/app/member-communications";
export const metadata={title:'Welcome to Freeborn',robots:{index:false}};
export default function Page(){return <AppShell><WelcomeScreen/></AppShell>;}
