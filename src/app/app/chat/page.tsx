import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { DraftChat } from "@/components/prototype/draft-chat";
import { ChatView } from "@/components/app/chat-view";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default async function ChatPage({searchParams}:{searchParams:Promise<{to?:string}>}) {
  const {to}=await searchParams;
  return (
    <AppShell>
      {to?<DraftChat profileId={to}/>:<ChatView />}
    </AppShell>
  );
}
