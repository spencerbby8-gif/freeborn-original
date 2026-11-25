import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { StoryPrivacy } from "@/components/app/stories";
export const metadata:Metadata={title:"Story privacy",robots:{index:false}};
export default function Page(){return <AppShell><div className="screen active"><div className="scroll"><StoryPrivacy/></div></div></AppShell>;}
