"use client";

import { useEffect, useState } from "react";

/**
 * The eight reference screens, in the order the sheet lays them out.
 *
 * This page exists so the whole product can be walked in a real browser without
 * a Supabase session: every tab is a real route, every pill, row and button a
 * real control. It is deliberately NOT a set of images — each entry renders the
 * same component the signed-in app renders, against fixture data shaped exactly
 * like the API payloads.
 */
export type ScreenId =
  | "discover"
  | "likes"
  | "messages"
  | "profile"
  | "notifications"
  | "settings"
  | "filters"
  | "premium";

export const SCREENS: { id: ScreenId; label: string; caption: string; href: string }[] = [
  { id: "discover", label: "Discover", caption: "Find meaningful connections.", href: "/preview?screen=discover" },
  { id: "likes", label: "Likes", caption: "See who's into you.", href: "/preview?screen=likes" },
  { id: "messages", label: "Messages", caption: "Meaningful conversations.", href: "/preview?screen=messages" },
  { id: "profile", label: "Profile", caption: "Your story, your vibe.", href: "/preview?screen=profile" },
  { id: "notifications", label: "Notifications", caption: "Stay in the loop.", href: "/preview?screen=notifications" },
  { id: "settings", label: "Settings", caption: "Control your experience.", href: "/preview?screen=settings" },
  { id: "filters", label: "Filters", caption: "Find who fits your world.", href: "/preview?screen=filters" },
  { id: "premium", label: "Premium", caption: "More connections, more possibilities.", href: "/preview?screen=premium" },
];

export function useScreenParam(fallback: ScreenId): [ScreenId, (s: ScreenId) => void] {
  const [screen, setScreen] = useState<ScreenId>(fallback);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("screen");
    if (q && SCREENS.some((s) => s.id === q)) {
      queueMicrotask(() => setScreen(q as ScreenId));
    }
  }, []);
  return [screen, setScreen];
}
