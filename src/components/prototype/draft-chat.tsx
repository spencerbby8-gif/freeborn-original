"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhotoImage } from "@/components/ui/photo-image";
import { Thread } from "@/components/app/chat-view";
import { getAccessToken } from "@/lib/supabase/browser";
import { conversationOpener } from "@/lib/conversation-opener";
import { memberRequest, useMemberResource, type Match } from "./data";
import { PrototypeIcon } from "./frame";
import { MemberDetail, type Detail } from "./member-detail";
import { Loading, ScreenError } from "./settings";

type Requests={incoming:{id:string;from:{id:string}}[];outgoing:{id:string;to:{id:string}}[]};
export function DraftChat({profileId}:{profileId:string}){
 const profile=useMemberResource<{profile:Detail}>(`/api/profile/${encodeURIComponent(profileId)}`);
 if(profile.loading)return <Loading/>;
 if(!profile.data)return <section className="screen active"><a className="bare-icon" href="/app/chat">Back to messages</a><ScreenError message={profile.error??'Profile unavailable.'}/></section>;
 return <DraftComposer key={profileId} profile={profile.data.profile}/>;
}
function DraftComposer({profile}:{profile:Detail}){
 const router=useRouter();const matches=useMemberResource<{matches:Match[]}>('/api/chat/matches');const requests=useMemberResource<Requests>('/api/chat/requests');
 const [text,setText]=useState(()=>conversationOpener(profile));const [token,setToken]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [pending,setPending]=useState(false);const [showProfile,setShowProfile]=useState(false);
 const match=matches.data?.matches.find(m=>m.with.id===profile.id);const incoming=requests.data?.incoming?.find(r=>r.from.id===profile.id);const outgoing=requests.data?.outgoing?.some(r=>r.to.id===profile.id);const waiting=pending||outgoing;
 useEffect(()=>{let live=true;void getAccessToken().then(t=>{if(live)setToken(t);});window.dispatchEvent(new CustomEvent('freeborn:chat-thread',{detail:{open:true}}));return()=>{live=false;window.dispatchEvent(new CustomEvent('freeborn:chat-thread',{detail:{open:false}}));};},[]);
 const reloadMatches=matches.reload;
 useEffect(()=>{if(!waiting)return;const id=setInterval(()=>void reloadMatches(),8000);return()=>clearInterval(id);},[waiting,reloadMatches]);
 async function sendRequest(){if(!text.trim()||busy||waiting)return;setBusy(true);setError(null);try{
  if(incoming){await memberRequest(`/api/chat/requests/${encodeURIComponent(incoming.id)}`,{action:'accept'});await matches.reload();await requests.reload();}
  else {const result=await memberRequest<{matchId?:string;requestId?:string;incomingId?:string}>('/api/chat/requests',{to:profile.id});if(result.matchId)await matches.reload();else if(result.incomingId){await requests.reload();setError('They’ve already invited you. Review and accept their invitation to chat.');}else if(result.requestId){setPending(true);await requests.reload();}else throw new Error('The server did not confirm a request.');}
 }catch(e){setError(e instanceof Error?e.message:'Could not send your request.');}finally{setBusy(false);}}
 const overlay=showProfile&&<MemberDetail profileId={profile.id} onClose={()=>setShowProfile(false)}/>;
 if(match)return <><Thread key={match.id} match={match} token={token} initialDraft={text} onBack={()=>router.push('/app/chat')} onChanged={()=>void matches.reload()} onTapProfile={()=>setShowProfile(true)}/>{overlay}</>;
 return <section className="screen active draft-chat" aria-label={`Draft chat with ${profile.name}`}><header className="draft-chat-head"><Button unstyled className="bare-icon" aria-label="Back to Discover" onClick={()=>router.push('/app')}><PrototypeIcon name="back"/></Button><Button unstyled className="draft-person" onClick={()=>setShowProfile(true)}>{profile.photos[0]&&<PhotoImage src={profile.photos[0]} alt="" className="draft-avatar"/>}<span><b>{profile.name}</b><small>Private draft · nothing sent on open</small></span></Button></header><div className="draft-chat-body"><div className="draft-intro"><PrototypeIcon name="messages"/><h1 className="display">A thoughtful hello.</h1><p>A suggestion inspired by {profile.name}’s public profile. Make it sound like you.</p></div><div className="draft-opener-preview"><span>YOUR UNSENT OPENER</span><p>{text||'Write your first hello below.'}</p></div><p className="draft-consent">{incoming?'They have invited you to chat. Accepting opens your conversation; you still choose when to send your opener.':waiting?'Invitation sent. Your opener is still private on this screen—not delivered. Once they accept, you can send it in your conversation.':'You haven’t connected yet. Send request asks for their consent to chat. Your opener stays private until they accept and you send it.'}</p>{waiting&&<p role="status" className="new-inline-note">Request pending. No message has been delivered.</p>}<ScreenError message={error??matches.error??requests.error}/>{profile.messageRestricted&&<p role="alert" className="new-inline-note">{profile.messageRestricted}</p>}</div><form className="draft-composer" onSubmit={e=>{e.preventDefault();void sendRequest();}}><label className="draft-input-label">Your opener<textarea aria-label="Your opener" maxLength={2000} rows={3} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/></label><div><Button unstyled className="btn-ghost" type="button" disabled={busy} onClick={()=>setText(conversationOpener(profile))}>Use suggestion</Button><Button unstyled className="btn-grad" type="submit" disabled={busy||waiting||!text.trim()||Boolean(profile.messageRestricted)||matches.loading||requests.loading||Boolean(matches.error||requests.error)}>{busy?'Working…':incoming?'Accept & open chat':waiting?'Request pending':'Send request'}</Button></div></form>{overlay}</section>;
}
