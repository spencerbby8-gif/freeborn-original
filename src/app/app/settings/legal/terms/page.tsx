import { AppShell } from "@/components/app/app-shell";
import { Back } from "@/components/prototype/frame";
import { TermsDocument } from "@/components/legal/terms-document";
export const metadata={title:'Terms',robots:{index:false}};
export default function Page(){return <AppShell><section className="screen active"><div className="scroll member-legal-scroll"><div className="bare-head settings-head"><Back href="/app/settings/about"/><h1 className="display settings-title">Terms of Service</h1></div><TermsDocument member/></div></section></AppShell>;}
