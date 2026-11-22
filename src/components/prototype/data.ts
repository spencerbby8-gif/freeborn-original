"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";

/** Member API requests retain the existing bearer/cookie authorization boundary. */
export async function memberRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : `Request failed (${response.status}). Please try again.`);
  if (result === null) throw new Error("The server returned an unreadable response. Please try again.");
  return result as T;
}
export function useMemberResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try { const next = await memberRequest<T>(url, undefined, signal); if (!signal?.aborted) setData(next); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load this screen."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void reload(controller.signal); });
    return () => controller.abort();
  }, [reload]);
  return { data, error, loading, reload, setData };
}
export type Settings = {
  account: {email: string};
  profile: { displayName: string; city: string; bio: string; discoverable: boolean; interests: string[]; relationshipGoals: string[] };
  discovery: {ageMin:number;ageMax:number;distanceKm:number;showGenders:string[];relationshipIntents:string[];verifiedOnly:boolean;photosRequired:boolean};
  privacy: {discoveryPaused:boolean;incognito:boolean;hideDistance:boolean;hideActiveStatus:boolean;readReceipts:boolean};
  notifications: {matchAlerts:boolean;messageAlerts:boolean;likeAlerts:boolean;profileActivity:boolean};
};
export type MemberProfile = {
  id:string;displayName:string;age:number|null;city:string;bio:string;occupation:string;photos:string[];isVerified:boolean;interests:string[];values:string[];relationshipGoals:string[];drinking:string;language:string;
};
export type DeckProfile = {
  id:string;name:string;age:number;city:string;occupation:string;headline:string;traits:string[];photo:string;photos:string[];verified:boolean;presence:string|null;distanceKm:number|null;isNew:boolean;
};
export type Match = {id:string;with:{id:string;name:string;city:string;photo:string;active:boolean};createdAt:string;ended:boolean;unread:number;lastMessage:{body:string;mine:boolean;at:string}|null};
