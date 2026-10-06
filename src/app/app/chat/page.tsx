import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { ChatView } from "@/components/app/chat-view";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };

export default function ChatPage() {
  return (
    <AppShell>
      <ChatView />
    </AppShell>
  );
}
