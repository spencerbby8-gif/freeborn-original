"use client";

import { FreebornLoader } from "@/components/ui/freeborn-loader";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PrototypeFrame } from "@/components/prototype/frame";
import { DiscoveryFilters } from "@/components/prototype/filters";
import { VerifyGate } from "./verify-modal";
import { CallListener } from "./call-listener";
import { NotificationCenter } from "./notification-center";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const open = () => setFiltersOpen(true);
    window.addEventListener("freeborn:open-filters", open);
    return () => window.removeEventListener("freeborn:open-filters", open);
  }, []);
  /** True while a chat conversation is open — the bottom tab bar hides. */
  const [threadOpen, setThreadOpen] = useState(false);
  /** Unread dots — fed live by the NotificationCenter. */
  const [unread, setUnread] = useState<{ alerts: number; chat: number; likes: number }>({
    alerts: 0,
    chat: 0,
    likes: 0,
  });

  useEffect(() => {
    /* Merge, don't clobber: partial events (e.g. "you're viewing this tab,
       its dot is zero") must not erase the other tabs' real counts. */
    const onUnread = (e: Event) => {
      const d = (e as CustomEvent<{ alerts?: number; chat?: number; likes?: number }>).detail;
      if (!d) return;
      setUnread((prev) => ({
        alerts: d.alerts ?? prev.alerts,
        chat: d.chat ?? prev.chat,
        likes: d.likes ?? prev.likes,
      }));
    };
    window.addEventListener("freeborn:unread", onUnread);
    window.addEventListener("freeborn:viewing", onUnread);
    return () => {
      window.removeEventListener("freeborn:unread", onUnread);
      window.removeEventListener("freeborn:viewing", onUnread);
    };
  }, []);

  /* The chat screen hides the bottom tabs while a conversation is open and
     brings them back when you return to the message list. */
  useEffect(() => {
    const onThread = (e: Event) => {
      const d = (e as CustomEvent<{ open?: boolean }>).detail;
      if (d) setThreadOpen(Boolean(d.open));
    };
    window.addEventListener("freeborn:chat-thread", onThread);
    return () => window.removeEventListener("freeborn:chat-thread", onThread);
  }, []);

  const dotFor = (href: string): number =>
    href === "/app/notifications" ? unread.alerts : href === "/app/chat" ? unread.chat : href === "/app/likes" ? unread.likes : 0;

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          window.location.replace("/auth?mode=sign-in");
          return;
        }

        /* Render IMMEDIATELY — the door check runs alongside, never blocking
           the screen. Cached for 10 minutes so tab switches stay instant. */
        setChecking(false);

        /* Presence heartbeat — truthful Active status for everyone. */
        const beat = () => {
          void (async () => {
            try {
              const t = (await supabase.auth.getSession()).data.session?.access_token;
              await fetch("/api/heartbeat", {
                method: "POST",
                headers: t ? { Authorization: `Bearer ${t}` } : {},
              }).catch(() => undefined);
            } catch {
              /* presence is best-effort */
            }
          })();
        };
        beat();
        window.setInterval(beat, 4 * 60 * 1000);

        try {
          const cachedAt = Number(window.sessionStorage.getItem("fb-security-checked") ?? "0");
          if (Date.now() - cachedAt < 10 * 60 * 1000) return;
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch("/api/security/check", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            window.sessionStorage.setItem("fb-security-checked", String(Date.now()));
            const verdict = await res.json();
            if (verdict.suspended) {
              await supabase.auth.signOut().catch(() => undefined);
              window.location.replace("/auth?mode=sign-in&status=suspended");
            }
          }
        } catch {
          /* security intel outage never locks out a real member */
        }
      } catch {
        window.location.replace("/auth?mode=sign-in");
      }
    })();
  }, []);

  if (checking) {
    return (
      <FreebornLoader fullScreen label="Preparing your session"/>
    );
  }

  const hideTabs = threadOpen || pathname.startsWith("/app/profile/edit") || pathname.startsWith("/app/preferences") || pathname.startsWith("/app/premium") || pathname.startsWith("/app/verification");

  return (
    <>
      <PrototypeFrame hideTabs={hideTabs || filtersOpen} unread={unread}>{children}{filtersOpen&&<DiscoveryFilters onClose={()=>setFiltersOpen(false)}/>}<VerifyGate/><CallListener/><NotificationCenter pathname={pathname} suppressPrompts={filtersOpen}/></PrototypeFrame>
    </>
  );
}
