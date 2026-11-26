"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Back } from "@/components/prototype/frame";
import { Loading, ScreenError } from "@/components/prototype/settings";
import { memberRequest, useMemberResource } from "@/components/prototype/data";
import { safeMemberNoticeHref } from "@/lib/member-notice-link";

type Notice = { id: string; kind: string; title: string; body: string; href: string; created_at: string; read_at: string | null };
type NoticePage = { notices: Notice[]; unreadCount: number; nextCursor: string | null };
const validPage = (p: NoticePage | null) => !!p && Array.isArray(p.notices) && Number.isSafeInteger(p.unreadCount) && p.unreadCount >= 0 && (p.nextCursor === null || typeof p.nextCursor === "string");
function stamp(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? "Time unavailable" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }

/** A fixed, non-member entry. No profile, send, typing, match or call controls. */
export function SystemInboxLink() {
  const resource = useMemberResource<NoticePage>("/api/member-notices");
  const reload = resource.reload;
  useEffect(() => { const id = window.setInterval(() => void reload(), 15000); const refresh=()=>void reload(); window.addEventListener("freeborn:feed-refresh", refresh); return () => { clearInterval(id); window.removeEventListener("freeborn:feed-refresh", refresh); }; }, [reload]);
  const count = validPage(resource.data) ? resource.data!.unreadCount : null;
  return <div className="system-inbox-row"><span className="system-inbox-mark" aria-hidden="true"><BrandMark size={46}/></span><Link href="/app/chat/freeborn" className="system-inbox-link"><span><b>Freeborn updates</b><small>{(resource.error || (resource.data && !validPage(resource.data))) ? "Updates temporarily unavailable" : count === null ? "Loading updates…" : count ? `${count} unread update${count===1?"":"s"}` : "Account and safety updates"}</small></span>{count !== null && count > 0 && <span className="system-inbox-count" aria-label={`${count} unread updates`}>{count>99?'99+':count}</span>}</Link></div>;
}

export function SystemInbox() {
  const router = useRouter();
  const [page, setPage] = useState<NoticePage | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const loadFirst = useCallback(async () => {
    setLoading(true); setError(null);
    try { const result = await memberRequest<NoticePage>("/api/member-notices"); if (!validPage(result)) throw new Error("Updates returned an unexpected response."); setPage(result); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load updates."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void loadFirst()); }, [loadFirst]);
  async function more() {
    if (!page?.nextCursor || busy || loading) return;
    setBusy(true); setError(null);
    try { const result=await memberRequest<NoticePage>(`/api/member-notices?cursor=${encodeURIComponent(page.nextCursor)}`); if (!validPage(result)) throw new Error("Updates returned an unexpected response."); setPage(current => { if (!current) return current; const seen=new Set(current.notices.map(n=>n.id)); return {...result,notices:[...current.notices,...result.notices.filter(n=>!seen.has(n.id))]}; }); }
    catch(e) { setError(e instanceof Error?e.message:"Could not load older updates."); }
    finally { setBusy(false); }
  }
  async function mark(n: Notice, open: boolean) {
    if (busy || loading) return;
    setBusy(true); setError(null);
    try {
      if (!n.read_at) {
        await memberRequest("/api/member-notices", { id: n.id });
        setPage(current => current && ({...current,unreadCount:Math.max(0,current.unreadCount-1),notices:current.notices.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x)}));
        window.dispatchEvent(new Event("freeborn:feed-refresh"));
      }
      const href=safeMemberNoticeHref(n.href);
      if (open && href) router.push(href);
    } catch(e) { setError(e instanceof Error?e.message:"Could not mark this update read."); }
    finally { setBusy(false); }
  }
  return <section className="screen active" aria-label="Freeborn updates"><div className="scroll new-form-screen"><div className="bare-head settings-head"><Back href="/app/chat"/><h1 className="display settings-title">Freeborn updates</h1></div><div className="system-inbox-intro"><BrandMark size={48}/><p>Account, support and safety updates from Freeborn. This is not a member profile or a chat you can reply to.</p></div><div className="new-panel"><h2>Safety resources</h2><p>Protect your account and watch for requests for money, codes or urgent investment offers.</p><Link href="/app/settings/safety">Read the safety guide</Link></div><ScreenError message={error} retry={()=>void loadFirst()}/>{loading&&!page?<Loading/>:page&&<><p className="fineprint">{page.unreadCount} unread · Updates are shared with Notifications. Clearing the alert feed does not mark these read.</p>{page.notices.length===0?<div className="new-panel"><p>No updates yet.</p></div>:page.notices.map(n=><article className="new-panel system-notice" key={n.id}><h2>{n.title}</h2><p className="fineprint"><time dateTime={n.created_at}>{stamp(n.created_at)}</time> · {n.read_at?'Read':'Unread'}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{n.body}</p><div className="system-notice-actions">{safeMemberNoticeHref(n.href)&&<Button unstyled className="btn-ghost" disabled={busy||loading} onClick={()=>void mark(n,true)}>Open related page</Button>}{!n.read_at&&<Button unstyled className="btn-ghost" disabled={busy||loading} onClick={()=>void mark(n,false)}>Mark as read</Button>}</div></article>)}{page.nextCursor&&<Button unstyled className="btn-ghost wide" disabled={busy||loading} onClick={()=>void more()}>{busy?'Loading…':'Load older updates'}</Button>}<Button unstyled className="btn-ghost wide" disabled={loading||busy} onClick={()=>void loadFirst()}>Refresh updates</Button></>}</div></section>;
}
