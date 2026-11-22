import { AppShell } from "@/components/app/app-shell";
import { Back } from "@/components/prototype/frame";
import { PrivacyDocument } from "@/components/legal/privacy-document";
export const metadata={title:'Privacy',robots:{index:false}};
export default function Page(){return <AppShell><section className="screen active"><div className="scroll member-legal-scroll"><div className="bare-head settings-head"><Back href="/app/settings/about"/><h1 className="display settings-title">Privacy Policy</h1></div><PrivacyDocument member/></div></section></AppShell>;}
