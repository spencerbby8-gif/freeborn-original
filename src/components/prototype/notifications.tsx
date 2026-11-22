"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PrototypeIcon } from "./frame";
import { memberRequest, useMemberResource } from "./data";
import { Loading, ScreenError } from "./settings";

type Item={id:string;type:'like'|'message'|'match'|'verification'|'tip';title:string;body:string;at:string;unread:boolean;href:string};
function ago(at:string){const minutes=Math.max(0,Math.floor((Date.now()-new Date(at).getTime())/60000));return minutes<1?'Just now':minutes<60?`${minutes} minutes ago`:minutes<1440?`${Math.floor(minutes/60)} hours ago`:`${Math.floor(minutes/1440)} days ago`;}
export function NotificationsScreen(){
  const resource=useMemberResource<{notifications:Item[]}>('/api/notifications');const [filter,setFilter]=useState('all');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{const id=setInterval(()=>void resource.reload(),15000);return()=>clearInterval(id);},[resource.reload]);
  async function clear(){setBusy(true);setError(null);try{await memberRequest('/api/notifications',{action:'clear'});await resource.reload();window.dispatchEvent(new CustomEvent('freeborn:viewing',{detail:{alerts:0}}));}catch(e){setError(e instanceof Error?e.message:'Could not clear notifications.');}finally{setBusy(false);}}
  const items=(resource.data?.notifications??[]).filter(n=>filter==='all'||filter===n.type||filter==='system'&&(n.type==='verification'||n.type==='tip'));
  return <section className="screen active" aria-label="Notifications"><div className="scroll"><div className="sub-head end"><h1 className="display screen-title single">Notifications</h1><Button unstyled className="skip-btn" onClick={()=>void clear()} disabled={busy||resource.loading}>Clear all</Button></div><div className="tab-chips">{[{key:'all',label:'All'},{key:'like',label:'Likes'},{key:'message',label:'Messages'},{key:'match',label:'Matches'},{key:'system',label:'System'}].map(f=><Button unstyled className={`tab-chip ${filter===f.key?'active':''}`} key={f.key} onClick={()=>setFilter(f.key)} aria-pressed={filter===f.key}>{f.label}</Button>)}</div><ScreenError message={error??resource.error} retry={()=>void resource.reload()}/>{resource.loading?<Loading/>:items.length?<><p className="new-label">NEW</p><div className="notif-list">{items.map(n=><Link href={n.href} key={n.id} className="notif-row"><span className={`notif-ic ${n.type==='message'?'green':n.type==='like'||n.type==='match'?'rose':'gold'}`}><PrototypeIcon name={n.type==='message'?'messages':n.type==='like'||n.type==='match'?'heart':'bell'}/></span><span className="notif-text"><b>{n.title}</b><small>{ago(n.at)}</small></span></Link>)}</div></>:!resource.error?<div className="empty-state"><PrototypeIcon name="bell"/><h2 className="display">All caught up</h2><p>New likes, matches and messages will land here.</p></div>:null}</div></section>;
}
