import { AppShell } from "@/components/app/app-shell";
import { Back } from "@/components/prototype/frame";
import { CookiesDocument } from "@/components/legal/cookies-document";
export const metadata={title:'Cookies',robots:{index:false}};
export default function Page(){return <AppShell><section className="screen active"><div className="scroll member-legal-scroll"><div className="bare-head settings-head"><Back href="/app/settings/about"/><h1 className="display settings-title">Cookie Policy</h1></div><CookiesDocument member/></div></section></AppShell>;}
