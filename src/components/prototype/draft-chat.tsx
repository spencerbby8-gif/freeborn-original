"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatHeader, ChatSendIcon } from "./chat-chrome";
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
 return <section className="screen active draft-chat reference-chat" aria-label={`Draft chat with ${profile.name}`}><ChatHeader name={profile.name} photo={profile.photos[0]} verified={profile.verified} subtitle="Private draft · nothing sent" onBack={()=>router.push('/app')} onProfile={()=>setShowProfile(true)}><button type="button" className="bare-icon" aria-label="View profile and safety" onClick={()=>setShowProfile(true)}><PrototypeIcon name="more"/></button></ChatHeader><div className="reference-chat-feed draft-consent-feed"><p className="reference-chat-day">PRIVATE DRAFT</p><div className="draft-consent-card"><p>Your opener is ready below.</p><p>A suggestion inspired by {profile.name}’s public profile. Edit it to sound like you.</p><p className="draft-consent">{incoming?'They have invited you to chat. Accepting opens your conversation; you still choose when to send your opener.':waiting?'Invitation sent. Your opener is still private on this screen—not delivered. Once they accept, you can send it in your conversation.':'You haven’t connected yet. Send request asks for their consent to chat. Your opener stays private until they accept and you send it.'}</p>{waiting&&<p role="status" className="new-inline-note">Request pending. No message has been delivered.</p>}<ScreenError message={error??matches.error??requests.error}/>{profile.messageRestricted&&<p role="alert" className="new-inline-note">{profile.messageRestricted}</p>}</div></div><form className="fb-composer reference-chat-composer" onSubmit={e=>{e.preventDefault();void sendRequest();}}><details className="reference-draft-tools"><summary className="plus-btn" aria-label="Draft tools"><PrototypeIcon name="plus"/></summary><div className="reference-chat-menu"><button type="button" disabled={busy} onClick={()=>setText(conversationOpener(profile))}>Use suggestion</button><p>Attachments unlock after you connect.</p></div></details><textarea aria-label="Your opener" placeholder="Write something thoughtful..." maxLength={1800} rows={1} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/><button className="reference-chat-send" type="submit" title={incoming?'Accept & open chat':waiting?'Request pending':'Send request'} aria-label={busy?'Working…':incoming?'Accept & open chat':waiting?'Request pending':'Send request'} disabled={busy||waiting||!text.trim()||Boolean(profile.messageRestricted)||matches.loading||requests.loading||Boolean(matches.error||requests.error)}><ChatSendIcon/></button></form>{overlay}</section>;
}
