"use client";


import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_PREFS, loadPrefs, PREFS_EVENT } from "@/lib/device-prefs";


export type IconName = "mic" | "video" | "file" | "back" | "next" | "heart" | "flame" | "discover" | "messages" | "profile" | "shield" | "lock" | "bell" | "filters" | "card" | "help" | "info" | "crown" | "close" | "eye" | "photo" | "edit" | "plus" | "search" | "more" | "coffee" | "globe" | "star";
const paths: Record<IconName, ReactNode> = {
  mic:<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3m-4 0h8"/></>,
  video:<><rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/></>,
  file:<><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>,
  more:<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  coffee:<><path d="M5 9h12v6a5 5 0 01-5 5h-2a5 5 0 01-5-5V9zM17 10h2a3 3 0 010 6h-2M8 3v3m4-3v3"/></>,
  globe:<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/></>,
  star:<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9L12 3z"/>,
  back: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  heart: <path d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z" />,
  flame: <path d="M13 2c1 5-3 6-2 9 1 2 3 2 3 5 2-1 3-3 2-6 4 4 4 8 1 11-4 4-11 0-10-5 0-3 3-5 3-8 2 1 2 3 2 3 2-3 2-5 1-9z" />,
  discover: <><circle cx="12" cy="12" r="9" /><path d="M16 8l-2.5 5.5L8 16l2.5-5.5L16 8z" /></>,
  messages: <><path d="M8 10h8M8 13.5h5M21 12c0 4-4 7-9 7a9.6 9.6 0 01-4-.8L3 20l1.6-4.2A7.4 7.4 0 013 12c0-4 4-7 9-7s9 3 9 7z" /></>,
  profile: <><circle cx="12" cy="7.6" r="3.3" /><path d="M5.6 20a6.4 6.4 0 0112.8 0" /></>,
  shield: <path d="M12 3l7 2.8v5.4c0 4.6-3 8.4-7 9.8-4-1.4-7-5.2-7-9.8V5.8L12 3z" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  bell: <><path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6z" /><path d="M10 19a2.2 2.2 0 004 0" /></>,
  filters: <><path d="M4 8h9M17 8h3M4 16h3M11 16h9" /><circle cx="15" cy="8" r="2" /><circle cx="9" cy="16" r="2" /></>,
  card: <><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M3.5 10.5h17" /></>,
  help: <><circle cx="12" cy="12" r="8.4" /><path d="M9.8 9.7a2.3 2.3 0 114 1.6c-.7.8-1.8 1-1.8 2.2M12 16.3v.1" /></>,
  info: <><circle cx="12" cy="12" r="8.4" /><path d="M12 11v5M12 7.9v.2" /></>,
  crown: <path d="M4 9.5l3.6 9h8.8l3.6-9-4.8 3.8L12 6l-3.2 7.3L4 9.5z" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  eye: <><path d="M2.5 12S6.5 6.3 12 6.3 21.5 12 21.5 12 17.5 17.7 12 17.7 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  photo: <><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.4" r="3.4" /></>,
  edit: <path d="M4 20l1-3.8L14.6 6.6a2 2 0 012.8 2.8L7.8 19 4 20z" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M16 16l5 5" /></>,
};
export function PrototypeIcon({ name, className }: { name: IconName; className?: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name]}</svg>;
}

const tabs: {href:string; label:string; icon:IconName}[] = [
  {href:"/app",label:"Discover",icon:"discover"},
  {href:"/app/likes",label:"Likes",icon:"heart"},
  {href:"/app/chat",label:"Messages",icon:"messages"},
  {href:"/app/profile",label:"Profile",icon:"profile"},
];

export function PrototypeFrame({ children, hideTabs = false, unread }: { children: ReactNode; hideTabs?: boolean; unread?: { chat: number; likes: number } }) {
  const pathname = usePathname();
  useEffect(()=>{try{const previous=sessionStorage.getItem('freeborn.member-route');if(pathname==='/app/profile/edit'&&previous&&previous!==pathname&&/^\/app(?:\/|$)/.test(previous))sessionStorage.setItem('freeborn.editor-return',previous);sessionStorage.setItem('freeborn.member-route',pathname);}catch{}},[pathname]);
  const [motion,setMotion]=useState(DEFAULT_PREFS.animations);
  useEffect(()=>{const read=()=>setMotion(loadPrefs().animations);queueMicrotask(read);window.addEventListener(PREFS_EVENT,read);window.addEventListener("storage",read);return()=>{window.removeEventListener(PREFS_EVENT,read);window.removeEventListener("storage",read);};},[]);
  const active = pathname.startsWith('/app/matches') ? '/app/likes' : pathname.startsWith('/app/settings') || pathname.startsWith('/app/privacy') || pathname.startsWith('/app/profile') ? '/app/profile' : pathname.startsWith('/app/notifications') ? '/app/chat' : pathname;
  return <div className="fb-prototype" data-motion={motion?"on":"off"}><div className="stage">
    <aside className="brand-rail" aria-label="About Freeborn">
      <Link href="/" className="rail-mark"><BrandMark size={38}/><span className="rail-word">Freeborn</span></Link>
      <h2 className="rail-head">Designed for <em>real<br />connections.</em></h2>
      <p className="rail-sub">Smart matches, real conversations, meaningful relationships.</p>
      <ul className="rail-points">
        <li><span className="rail-ic"><PrototypeIcon name="shield" /></span><span><b>Intent-based matching.</b><br />We focus on what truly matters to you.</span></li>
        <li><span className="rail-ic"><PrototypeIcon name="lock" /></span><span><b>Privacy first.</b><br />Your data stays private and secure.</span></li>
        <li><span className="rail-ic"><PrototypeIcon name="messages" /></span><span><b>Better conversations.</b><br />Start with something you share.</span></li>
      </ul>
    </aside>
    <div className="phone-wrap"><div className="phone" data-tab={hideTabs ? "none" : active}>
      <main className="fb-content" id="member-content">{children}</main>
      {!hideTabs && <nav className="tabbar" aria-label="Main navigation">{tabs.map(tab => {
        const count = tab.href === '/app/chat' ? unread?.chat : tab.href === '/app/likes' ? unread?.likes : 0;
        return <Link key={tab.href} href={tab.href} className={`tab ${active === tab.href ? 'active' : ''}`} aria-current={active === tab.href ? 'page' : undefined}><span className="tab-ic"><PrototypeIcon name={tab.icon} />{Boolean(count) && <span className="badge">{count! > 99 ? '99+' : count}</span>}</span><span>{tab.label}</span></Link>;
      })}</nav>}
    </div></div>
  </div></div>;
}

export function Back({ href = '/app/profile' }: { href?: string }) {
  return <Link href={href} className="bare-icon" aria-label="Back"><PrototypeIcon name="back" /></Link>;
}
export function MenuRow({href,icon,children}:{href:string;icon:IconName;children:ReactNode}) {
  return <Link href={href} className="menu-row"><span className="menu-ic"><PrototypeIcon name={icon} /></span>{children}<PrototypeIcon name="next" className="chev" /></Link>;
}
