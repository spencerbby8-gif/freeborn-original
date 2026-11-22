"use client";

import { draftChatHref } from "@/lib/conversation-opener";
import { memberTapFeedback } from "@/lib/device-prefs";
import { Button } from "@/components/ui/button";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerificationShield } from "@/components/prototype/verification-shield";
import { VerifyBadge } from "@/components/verify-badge";

import { DiscoveryCard } from "./discovery-card";
import { MemberDetail } from "./member-detail";
import { buildProfileParams, loadFilters, DEFAULT_FILTERS, FILTERS_EVENT, type HomeFilters } from "@/components/app/filters";
import { openVerifyFlow } from "@/components/app/verify-modal";
import { Back, MenuRow, PrototypeIcon } from "./frame";
import { memberRequest, useMemberResource, type DeckProfile, type MemberProfile, type Match } from "./data";
import { Loading, ScreenError } from "./settings";

function Portrait({src,name,className}:{src?:string;name:string;className?:string}) {
  return src?<PhotoImage src={src} alt={name} className={className??''} imgClassName="object-cover"/>:<span className={`fb-placeholder ${className??''}`} aria-label={`${name}, no photo`}>{name.slice(0,1)}</span>;
}
function Verified({yes}:{yes:boolean}) {return yes?<span className="verified"><VerifyBadge size={17}/></span>:null;}
function Empty({title,body}:{title:string;body:string}) {return <div className="empty-state"><h3>{title}</h3><p>{body}</p></div>;}

export function DiscoverScreen(){
  const [query,setQuery]=useState("");
  const [filterState,setFilterState]=useState<HomeFilters>({...DEFAULT_FILTERS});
  const standing=useMemberResource<import("./data").Settings>("/api/settings");
  const intent=filterState.intents[0]??standing.data?.discovery.relationshipIntents[0];
  const intentLabel=intent?({long_term:"Long-term",life_partner:"Life partner",friendship:"Friendship",still_exploring:"Exploring"}[intent]??intent):"Your intentions";
  useEffect(()=>{const update=()=>{setFilterState(loadFilters());let origin:{lat:number;lng:number}|null=null;try{const raw=sessionStorage.getItem('freeborn.origin');if(raw){const value=JSON.parse(raw);if(Number.isFinite(value.lat)&&Number.isFinite(value.lng))origin=value;}}catch{}setQuery(`?${buildProfileParams(loadFilters(),origin).toString()}`);setIndex(0);};queueMicrotask(update);window.addEventListener(FILTERS_EVENT,update);return()=>window.removeEventListener(FILTERS_EVENT,update);},[]);
  const router=useRouter();const resource=useMemberResource<{profiles:DeckProfile[]}>(`/api/profiles${query}`);
  const [index,setIndex]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);const [detail,setDetail]=useState<string|null>(null);
  const current=resource.data?.profiles[index];
  const scrollRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{const node=scrollRef.current;if(node){node.scrollTop=0;const parent=node.closest('.fb-content');if(parent)parent.scrollTop=0;}},[current?.id]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(null),3500);return()=>clearTimeout(id);},[notice]);
  async function swipe(choice:'like'|'pass'|'superlike'){
    if(!current||busy)return;memberTapFeedback();setBusy(true);setError(null);setNotice(null);
    try{const r=await memberRequest<{matched?:boolean}>('/api/likes',{profileId:current.id,choice});setIndex(i=>i+1);if(r.matched)setNotice('It’s mutual — say hello while the moment is warm.');else if(choice!=='pass')setNotice(choice==='superlike'?'Spark sent.':'Added to your likes.');}catch(e){setError(e instanceof Error?e.message:'Could not record your choice.');}finally{setBusy(false);}
  }
  function sayHello(){if(current&&!busy)router.push(draftChatHref(current.id));}
  async function reset(){setBusy(true);setError(null);try{await memberRequest('/api/likes',{action:'reset-passes'});await resource.reload();setIndex(0);}catch(e){setError(e instanceof Error?e.message:'Could not reset the deck.');}finally{setBusy(false);}}
  return <section className="screen active" aria-label="Discover"><div className="scroll discover-scroll" ref={scrollRef}><div className="disc-head"><span className="eyebrow">{current?.city?`TONIGHT IN ${current.city.toLocaleUpperCase()}`:'MEET WITH INTENTION'}</span><Link href="/app/notifications" className="disc-heart" aria-label="Notifications"><PrototypeIcon name="heart"/></Link></div><h1 className="display disc-headline">Someone you’ll<br/>remember.</h1>
    <div className="intent-chips"><Link href="/app/preferences" className="chip chip-rose">{intentLabel}</Link><Button unstyled className="chip chip-rose-dim" onClick={()=>window.dispatchEvent(new Event('freeborn:open-filters'))}>{filterState.lifestyle[0]??"Lifestyle"}</Button><Button unstyled className="chip chip-rose-dim" onClick={()=>window.dispatchEvent(new Event('freeborn:open-filters'))}>{filterState.interests[0]??"Interests"}</Button><Button unstyled className="chip chip-flame" aria-label="Discovery filters" onClick={()=>window.dispatchEvent(new Event('freeborn:open-filters'))}><PrototypeIcon name="flame"/></Button></div>
    <ScreenError message={error??resource.error} retry={resource.error?()=>void resource.reload():undefined}/>{notice&&<p className="discover-feedback" role="status">{notice}</p>}
    <div className="deck">{resource.loading?<Loading/>:current?<DiscoveryCard key={current.id} profile={current} busy={busy} onOpen={()=>setDetail(current.id)} onChoice={choice=>void swipe(choice)} onHello={sayHello}/>:<div className="deck-empty"><PrototypeIcon name="discover"/><h3>You’ve met everyone for now.</h3><p>A little pause can lead to something good.<br/>Try again soon, or widen your world.</p><div className="empty-actions"><Button unstyled className="btn-grad sm" onClick={()=>void reset()} disabled={busy}>Reset deck</Button><Link href="/app/preferences" className="btn-ghost">Widen preferences</Link></div></div>}</div>

  </div>{detail&&<MemberDetail profileId={detail} onClose={()=>setDetail(null)}/>}</section>;
}

type Like = {id:string;name:string;city:string;photo:string;verified:boolean;likedAt:string;matched:boolean;matchId:string|null;age?:number|null;occupation?:string;interests?:string[];distanceKm?:number|null};
export function LikesScreen(){
  const router=useRouter();const resource=useMemberResource<{likedYou:Like[];liked:Like[]}>('/api/likes');const me=useMemberResource<{profile:MemberProfile}>('/api/profile/me');
  const [filter,setFilter]=useState('all');const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [detail,setDetail]=useState<string|null>(null);
  const incoming=resource.data?.likedYou??[];const cutoff=Date.now()-86400000;
  const visible=incoming.filter(p=>filter==='all'||filter==='new'&&new Date(p.likedAt).getTime()>cutoff||filter==='nearby'&&p.distanceKm!=null&&p.distanceKm<=40||filter==='similar'&&p.interests?.some(i=>me.data?.profile.interests.includes(i)));
  async function back(p:Like){if(busy)return;setBusy(p.id);setError(null);try{const r=await memberRequest<{matched?:boolean;matchId?:string}>('/api/likes',{profileId:p.id,choice:'like'});await resource.reload();if(r.matched)router.push('/app/matches');}catch(e){setError(e instanceof Error?e.message:'Could not send like.');}finally{setBusy(null);}}
  return <section className="screen active" aria-label="Likes"><div className="scroll"><div className="sub-head end likes-head"><h1 className="display screen-title">People who<br/>like you<span className="badge-likes">{incoming.length}</span></h1><Button unstyled className="bare-icon" aria-label="Filter" onClick={()=>window.dispatchEvent(new Event('freeborn:open-filters'))}><PrototypeIcon name="filters"/></Button></div><div className="tab-chips">{[{value:'all',label:'All'},{value:'new',label:`New ${incoming.filter(p=>new Date(p.likedAt).getTime()>cutoff).length}`},{value:'nearby',label:'Nearby'},{value:'similar',label:'Similar'}].map(f=><Button unstyled key={f.value} className={`tab-chip ${filter===f.value?'active':''}`} aria-pressed={filter===f.value} onClick={()=>setFilter(f.value)}>{f.label}</Button>)}</div><ScreenError message={error??resource.error} retry={()=>void resource.reload()}/>{resource.loading?<Loading/>:<div className="like-list">{visible.map(p=><article className="like-row" key={p.id}><Button unstyled onClick={()=>setDetail(p.id)} aria-label={`View ${p.name}`}><Portrait src={p.photo} name={p.name} className="like-photo"/></Button><div className="like-meta"><div className="like-name">{p.name}{p.age?`, ${p.age}`:''}<Verified yes={p.verified}/></div><div className="like-role">{p.occupation||p.city}</div><div className="like-dist">{p.distanceKm==null?'Distance private or unavailable':`${Math.round(p.distanceKm/1.609344)} miles away`}</div></div>{p.matched?<Link href={`/app/chat?match=${encodeURIComponent(p.matchId??'')}`} className="like-btn liked" aria-label={`Message ${p.name}`}><PrototypeIcon name="messages"/></Link>:<Button unstyled className="like-btn" aria-label={`Like ${p.name} back`} disabled={busy!==null} onClick={()=>void back(p)}><PrototypeIcon name="heart"/></Button>}</article>)}{visible.length===0&&<Empty title="Nothing here yet" body="When someone likes your profile, you’ll see them here."/>}</div>}<Link className="fineprint center" style={{display:'block'}} href="/app/likes/activity">Your likes &amp; activity</Link></div>{detail&&<MemberDetail profileId={detail} onClose={()=>setDetail(null)}/>}</section>;
}

export function MatchesScreen(){
  const resource=useMemberResource<{matches:Match[]}>('/api/chat/matches');const matches=resource.data?.matches.filter(m=>!m.ended)??[];
  return <section className="screen active" aria-label="Matches"><div className="scroll"><div className="matches-top"><span className="matches-eyebrow">NEW MATCHES</span><span className="matches-count">{matches.length}</span></div><h1 className="display matches-title">It’s mutual.</h1><p className="matches-sub">Say hello while the moment is warm.</p><ScreenError message={resource.error} retry={()=>void resource.reload()}/>{resource.loading?<Loading/>:matches.length===0?<Empty title="A little spark is on its way" body="When you like each other, your matches will appear here."/>:<><div className="match-cards">{matches.map(m=><Link href={`/app/chat?match=${encodeURIComponent(m.id)}`} className="match-card" key={m.id}><Portrait src={m.with.photo} name={m.with.name}/><b>{m.with.name}</b><span>{m.with.city}</span></Link>)}</div>{matches.map(m=><div className="match-row-card" key={m.id}><Portrait src={m.with.photo} name={m.with.name} className="match-row-photo"/><div className="match-row-text"><b>You and {m.with.name}</b><span>You liked each other. Start something.</span></div><Link href={`/app/chat?match=${encodeURIComponent(m.id)}`} className="say-hello small">Say hello</Link></div>)}</>}</div></section>;
}

export function MyProfileScreen(){
  const resource=useMemberResource<{profile:MemberProfile}>('/api/profile/me');const likes=useMemberResource<{likedYou:Like[]}>('/api/likes');const matches=useMemberResource<{matches:Match[]}>('/api/chat/matches');const [view,setView]=useState(false);
  if(resource.loading)return <Loading/>;if(!resource.data)return <ScreenError message={resource.error} retry={()=>void resource.reload()}/>;
  const p=resource.data.profile;
  return <section className="screen active" aria-label="My profile"><div className="scroll flush"><div className="mp-hero"><Portrait src={p.photos[0]} name={p.displayName}/><div className="mp-shade"/><Button unstyled className="mp-eye" aria-label="View profile" onClick={()=>setView(true)}><PrototypeIcon name="eye"/></Button><div className="mp-id"><h1 className="pd-name">{p.displayName}<Verified yes={p.isVerified}/></h1><p className="pd-sub">{[p.age,p.city].filter(Boolean).join(' · ')}</p><p className="mp-quote">{p.bio}</p><Link href="/app/profile/edit" className="edit-pill"><PrototypeIcon name="edit"/>Edit</Link></div></div><div className="mp-body"><div className="mp-stats"><div className="mp-stat"><PrototypeIcon name="eye"/><b title="Profile view tracking is not configured">—</b><span>Profile views</span></div><Link href="/app/likes" className="mp-stat"><PrototypeIcon name="heart"/><b>{likes.data?.likedYou.length??'—'}</b><span>Likes received</span></Link><Link href="/app/matches" className="mp-stat"><PrototypeIcon name="heart"/><b>{matches.data?.matches.filter(m=>!m.ended).length??'—'}</b><span>Matches</span></Link></div><div className="mp-photos-head"><span className="photos-label"><PrototypeIcon name="photo"/>My photos</span><Link href="/app/profile/edit#photos" className="photos-count">{p.photos.length}<PrototypeIcon name="next"/></Link></div><div className="photo-strip">{p.photos.slice(0,3).map((photo,i)=><Portrait key={photo} src={photo} name={`${p.displayName} photo ${i+1}`}/>)}<Link href="/app/profile/edit#photos" className="photo-add-tile" aria-label="Add photo"><PrototypeIcon name="plus"/></Link></div><div className="menu-group"><MenuRow href="/app/profile/edit" icon="profile">About me</MenuRow><MenuRow href="/app/preferences" icon="heart">Interests</MenuRow><MenuRow href="/app/preferences" icon="filters">Preferences</MenuRow><MenuRow href="/app/verification" icon="shield">Verification</MenuRow><MenuRow href="/app/settings" icon="card">Settings</MenuRow></div></div></div>{view&&<div className="fb-detail-overlay"><MemberDetail profileId={p.id} onClose={()=>setView(false)} ownPreview/></div>}</section>;
}

export function VerificationScreen(){
  const resource=useMemberResource<{profile:MemberProfile}>('/api/profile/me');
  return <section className="screen active" aria-label="Verification"><div className="scroll"><div className="bare-head"><Back/></div><div className="verify-hero"><span className="shield-ring"><VerificationShield/></span><h1 className="display verify-head">Show you’re<br/>really you.</h1><p className="verify-sub">A quick, private check helps keep Freeborn a place for real people.</p></div><div className="face-frame"><div className="face-glow" aria-hidden="true"/><p className="face-hint">{resource.data?.profile.isVerified?'Your profile is verified.':'Center your face in the frame'}</p></div><ul className="check-list">{['Private by design','Recent photo required','No public biometric data'].map(label=><li key={label}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#e9c37c"/><path d="M8 12l3 3 5-6" stroke="#241a10" strokeWidth="1.8" fill="none"/></svg>{label}</li>)}</ul><Button unstyled className="btn-grad big" onClick={()=>openVerifyFlow()} disabled={resource.loading}>Start verification</Button><p className="fineprint center">Your camera opens only when you choose to begin. Verification is evaluated by the existing private verification service.</p><ScreenError message={resource.error}/></div></section>;
}

// Existing messages, media, calls, reactions and consent logic remain in ChatView.
// This adapter only supplies prototype list styling; it never simulates a reply.
export function MessagesHeading(){
  const [search,setSearch]=useState('');
  useEffect(()=>{window.dispatchEvent(new CustomEvent('freeborn:chat-search',{detail:search}));},[search]);
  return <><div className="sub-head end"><h1 className="display screen-title single">Messages</h1><div style={{display:'flex'}}><Button unstyled className="bare-icon" aria-label="Search" onClick={()=>document.getElementById('message-search')?.focus()}><PrototypeIcon name="search"/></Button><Link className="bare-icon" href="/app/matches" aria-label="New message"><PrototypeIcon name="edit"/></Link></div></div><label className="search-bar"><PrototypeIcon name="search"/><input id="message-search" aria-label="Search conversations" placeholder="Search conversations..." value={search} onChange={e=>setSearch(e.target.value)}/></label></>;
}
