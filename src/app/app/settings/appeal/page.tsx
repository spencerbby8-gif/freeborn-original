import { AppShell } from "@/components/app/app-shell";
import { AppealExperience } from "@/app/appeal/appeal-experience";
export const metadata={title:'Account appeals',robots:{index:false}};
export default function Page(){return <AppShell><AppealExperience member/></AppShell>;}
