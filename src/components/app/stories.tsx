"use client";
import { Button } from "@/components/ui/button";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/supabase/browser";
import { STORY_DISCLOSURE } from "@/lib/story-policy";
import { PhotoImage } from "@/components/ui/photo-image";
import { PrototypeIcon } from "@/components/prototype/frame";
import { memberRequest, useMemberResource } from "@/components/prototype/data";
import { useModalFocus } from "@/components/prototype/modal-focus";

type Story = {id:string;authorId:string;name:string;photo:string;caption:string;createdAt:string;expiresAt:string;imageUrl:string;viewed:boolean;viewerCount:number|null};
type Feed = {memberId:string;stories:Story[]};
type StoryMatch = {id:string;ended:boolean;with:{id:string;name:string;photo:string}};
type Audience = {audience:"all"|"exclude"|"only";selectedIds:string[]};

/** Private bytes are fetched with Bearer auth; no token URLs or persistent image cache. */
function PrivatePicture({src,alt,onReady,className=""}:{src:string;alt:string;onReady?:()=>void;className?:string}){
 const [result,setResult]=useState<{src:string;url:string;error:boolean}>({src:"",url:"",error:false});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let objectUrl="";
  void(async()=>{try{
   const token=await getAccessToken();if(!token)throw Error("Session expired");
   const response=await fetch(src,{cache:"no-store",signal:controller.signal,headers:{Authorization:`Bearer ${token}`}});
   if(!response.ok)throw Error("Unavailable");
   const blob=await response.blob();if(controller.signal.aborted)return;
   objectUrl=URL.createObjectURL(blob);setResult({src,url:objectUrl,error:false});
  }catch{if(!controller.signal.aborted)setResult({src,url:"",error:true});}})();
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[src,retry]);
 if(result.src!==src||!result.url&&!result.error)return <span className={`story-picture-loading ${className}`} role="status">Loading picture…</span>;
 if(result.error)return <Button unstyled type="button" className="story-picture-loading" onClick={()=>{setResult({src:"",url:"",error:false});setRetry(n=>n+1);}}>Picture unavailable. Tap to retry.</Button>;
 return <img src={result.url} alt={alt} className={className} onLoad={onReady}/>;
}

export function StoryReplyQuote({quote}:{quote:{authorIsMe:boolean;caption:string;imageUrl:string}}){
 return <div className="story-reply-quote"><span>{quote.authorIsMe?"Replied to your story":"Replied to their story"}</span><PrivatePicture src={quote.imageUrl} alt="The exact story picture replied to" className="story-quote-picture"/>{quote.caption&&<small>{quote.caption}</small>}</div>;
}

export function StoryPrivacy({onClose}:{onClose?:()=>void}){
 const resource=useMemberResource<Audience>("/api/stories/privacy");
 const matches=useMemberResource<{matches:StoryMatch[]}>("/api/chat/matches");
 const [draft,setDraft]=useState<Audience|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const value=draft??resource.data;
 const eligible=matches.data?.matches.filter(m=>!m.ended)??[];
 async function save(){if(!value||busy)return;setBusy(true);setError("");setSaved(false);try{await memberRequest('/api/stories/privacy',value);await resource.reload();setDraft(null);setSaved(true);}catch(e){setError(e instanceof Error?e.message:'Could not save audience.');}finally{setBusy(false);}}
 return <section className="story-privacy"><header className="story-section-head">{onClose?<Button unstyled type="button" className="bare-icon" aria-label="Back from story privacy" onClick={onClose}><PrototypeIcon name="back"/></Button>:<Link href="/app/privacy" className="bare-icon" aria-label="Back to privacy"><PrototypeIcon name="back"/></Link>}<div><span className="story-eyebrow">YOUR CIRCLE</span><h1 className="display">Story privacy</h1></div></header><p className="story-muted">Share little moments with the people you choose. Only active, unblocked matches are eligible.</p>
 {(resource.error||matches.error||error)&&<p role="alert" className="story-error">{error||resource.error||matches.error}<Button unstyled type="button" onClick={()=>{void resource.reload();void matches.reload();}}>Try again</Button></p>}
 {!value?<p role="status">Loading your audience…</p>:<><fieldset className="story-audience-options" disabled={busy}><legend>Who can see your stories?</legend>{([{key:'all',title:'All my matches',note:'Every eligible match.'},{key:'exclude',title:'My matches, except…',note:'Hide your stories from selected matches.'},{key:'only',title:'Only share with…',note:'Nobody else sees your stories.'}] as const).map(option=><label key={option.key}><input type="radio" name="story-audience" value={option.key} checked={value.audience===option.key} onChange={()=>{setDraft({...value,audience:option.key});setSaved(false);}}/><span><b>{option.title}</b><small>{option.note}</small></span></label>)}</fieldset>
 {value.audience!=='all'&&<fieldset className="story-audience-people" disabled={busy}><legend>{value.audience==='only'?'Only these matches':'Exclude these matches'} · {value.selectedIds.length} selected</legend>{eligible.map(m=><label key={m.id}><input type="checkbox" checked={value.selectedIds.includes(m.with.id)} onChange={e=>{setDraft({...value,selectedIds:e.target.checked?[...value.selectedIds,m.with.id]:value.selectedIds.filter(id=>id!==m.with.id)});setSaved(false);}}/><span>{m.with.name}</span></label>)}{!eligible.length&&<p className="story-muted">Your active matches will appear here.</p>}{value.audience==='only'&&!value.selectedIds.length&&<p className="story-muted">No matches selected: nobody else can see your stories.</p>}</fieldset>}
 <p className="story-muted">Changes apply to existing and future stories immediately on the server. They cannot recall pictures already seen, saved or quoted into chat.</p><Button unstyled type="button" className="btn-grad wide" onClick={()=>void save()} disabled={busy||!!matches.error}>{busy?'Saving…':'Save audience'}</Button>{saved&&<p role="status" className="story-success">Audience saved.</p>}</>}
 </section>;
}

function StoryComposer({onClose,onPosted,onPrivacy}:{onClose:()=>void;onPosted:()=>void;onPrivacy:()=>void}){
 const [files,setFiles]=useState<File[]>([]),[caption,setCaption]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const [preview,setPreview]=useState('');
 useEffect(()=>{if(!files[0])return;const url=URL.createObjectURL(files[0]);setPreview(url);return()=>URL.revokeObjectURL(url);},[files]);
 async function post(){if(!files.length||!ack||busy)return;setBusy(true);setError('');let posted=0;
 try{const token=await getAccessToken();if(!token)throw Error('Please sign in again.');
 for(const file of files){setProgress(`Sharing picture ${posted+1} of ${files.length}…`);const form=new FormData();form.set('file',file);form.set('caption',caption);form.set('acknowledgeRetention','true');const response=await fetch('/api/stories',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});const json=await response.json().catch(()=>null);if(!response.ok)throw Error(json?.error??'Could not share this picture.');posted++;}
 onPosted();onClose();
 }catch(e){if(posted){setFiles(previous=>previous.slice(posted));onPosted();}setError(`${posted?`${posted} shared successfully. Remaining pictures were not shared. `:''}${e instanceof Error?e.message:'Please try again.'}`);}finally{setBusy(false);setProgress('');}}
 return <section className="story-compose"><header className="story-section-head"><Button unstyled type="button" className="bare-icon" aria-label="Close story composer" disabled={busy} onClick={onClose}><PrototypeIcon name="close"/></Button><div><span className="story-eyebrow">A LITTLE OF YOUR WORLD</span><h1 className="display">Your story</h1></div></header><p className="story-muted">One moment, or a few. Each picture stays in Stories for 24 hours.</p>
 <label className="story-upload"><PrototypeIcon name="photo"/><b>Choose pictures</b><small>JPG, PNG or WebP · up to 4 MB each · 20 pictures per 24 hours</small><input type="file" aria-label="Choose story pictures" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{const selected=Array.from(e.target.files??[]);if(selected.length>20||selected.some(f=>f.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type))){setError('Choose up to 20 JPG, PNG or WebP pictures, each under 4 MB.');return;}setFiles(selected);setError('');}}/></label>
 {!!files.length&&<><p className="story-muted">{files.length} picture{files.length===1?'':'s'} selected</p>{preview&&<img src={preview} alt="First selected story preview" className="story-composer-preview"/>}<ul className="story-file-list">{files.map((file,i)=><li key={`${file.name}-${i}`}><span>{file.name}</span><Button unstyled type="button" disabled={busy} aria-label={`Remove picture ${i+1}`} onClick={()=>setFiles(files.filter((_,n)=>n!==i))}>Remove</Button></li>)}</ul></>}
 <label className="story-field">Caption <textarea aria-label="Story caption" maxLength={280} value={caption} disabled={busy} placeholder="A small moment worth sharing…" onChange={e=>setCaption(e.target.value)}/></label><Button unstyled type="button" className="story-audience-link" onClick={onPrivacy} disabled={busy}><PrototypeIcon name="lock"/>Choose who can see this</Button>
 <label className="story-retention"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/><span>{STORY_DISCLOSURE}</span></label>
 {error&&<p role="alert" className="story-error">{error}</p>}{progress&&<p role="status">{progress}</p>}<Button unstyled type="button" className="btn-grad wide" disabled={busy||!ack||!files.length} onClick={()=>void post()}>{busy?'Sharing…':`Share ${files.length>1?`${files.length} pictures`:'story'}`}</Button>
 </section>;
}

function StoryViewer({stories,memberId,onClose,onRefresh}:{stories:Story[];memberId:string;onClose:()=>void;onRefresh:()=>void}){
 const [index,setIndex]=useState(0),[now,setNow]=useState(()=>Date.now()),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false),[viewers,setViewers]=useState<Array<{id:string;name:string;viewedAt:string}>|null>(null),[confirmDelete,setConfirmDelete]=useState(false);
 const [orderedIds]=useState(()=>stories.map(s=>s.id));
 const current=stories.find(s=>s.id===orderedIds[index]);const self=current?.authorId===memberId;
 const seen=useRef(new Set<string>());const clientId=useRef<string>('');
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 const navigate=useCallback((next:number)=>{if(next<0)return;if(next>=orderedIds.length){onClose();return;}setIndex(next);setText('');setError('');setSent(false);setViewers(null);setConfirmDelete(false);clientId.current='';},[orderedIds.length,onClose]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches('input,textarea'))return;if(e.key==='Escape')onClose();if(e.key==='ArrowRight')navigate(index+1);if(e.key==='ArrowLeft')navigate(index-1);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[index,navigate,onClose]);
 const markViewed=()=>{if(!current||self||seen.current.has(current.id))return;seen.current.add(current.id);void memberRequest(`/api/stories/${current.id}/views`,{}).catch(()=>seen.current.delete(current.id));};
 async function reply(){if(!current||busy||!text.trim())return;setBusy(true);setError('');if(!clientId.current)clientId.current=crypto.randomUUID();try{await memberRequest(`/api/stories/${current.id}/reply`,{text:text.trim(),clientId:clientId.current});setText('');setSent(true);clientId.current='';window.dispatchEvent(new Event('freeborn:feed-refresh'));}catch(e){setError(e instanceof Error?e.message:'Could not send reply.');}finally{setBusy(false);}}
 async function showViewers(){if(!current)return;setError('');try{const result=await memberRequest<{viewers:Array<{id:string;name:string;viewedAt:string}>}>(`/api/stories/${current.id}/views`);setViewers(result.viewers);}catch(e){setError(e instanceof Error?e.message:'Could not load viewers.');}}
 async function remove(){if(!current||busy)return;setBusy(true);try{await memberRequest(`/api/stories/${current.id}`,undefined,undefined,'DELETE');onRefresh();onClose();}catch(e){setError(e instanceof Error?e.message:'Could not delete story.');}finally{setBusy(false);}}
 if(!current||new Date(current.expiresAt).getTime()<=now)return <section className="story-expired"><PrototypeIcon name="photo"/><h2 className="display">This moment has passed.</h2><p>Stories are available for 24 hours.</p><Button unstyled type="button" className="btn-grad" onClick={onClose}>Back to messages</Button></section>;
 return <section className="story-viewer" aria-label={`${current.name}'s stories`}><div className="story-segments" aria-label={`Story ${index+1} of ${orderedIds.length}`}>{orderedIds.map((id,i)=><Button unstyled type="button" key={id} className={i<=index?'seen':''} aria-label={`View story ${i+1}`} aria-current={i===index?'step':undefined} onClick={()=>navigate(i)}/>)}</div>
 <header className="story-viewer-head">{current.photo?<PhotoImage src={current.photo} alt="" className="story-avatar" compact/>:<span className="story-avatar story-initial">{current.name[0]}</span>}<div><b>{self?'Your story':current.name}</b><small>{new Date(current.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {Math.max(1,Math.ceil((new Date(current.expiresAt).getTime()-now)/3600000))}h left</small></div><Button unstyled type="button" className="bare-icon" aria-label="Close story viewer" onClick={onClose}><PrototypeIcon name="close"/></Button></header>
 <div className="story-stage"><PrivatePicture key={current.id} src={current.imageUrl} alt={current.caption||`${current.name}'s story picture`} onReady={markViewed} className="story-full-picture"/>{current.caption&&<p className="story-caption">{current.caption}</p>}</div>
 <div className="story-navigation"><Button unstyled type="button" disabled={index===0} onClick={()=>navigate(index-1)}><PrototypeIcon name="back"/>Previous</Button><span>{index+1} / {orderedIds.length}</span><Button unstyled type="button" onClick={()=>navigate(index+1)}>{index+1===orderedIds.length?'Done':'Next'}<PrototypeIcon name="next"/></Button></div>
 {error&&<p role="alert" className="story-error">{error}</p>}
 {self?<footer className="story-owner-actions"><Button unstyled type="button" onClick={()=>void showViewers()}><PrototypeIcon name="eye"/>Viewers</Button><Button unstyled type="button" onClick={()=>setConfirmDelete(true)}>Delete story</Button>{confirmDelete&&<div className="story-delete-confirm"><p>Remove this picture from Stories? Copies already quoted in chat remain.</p><Button unstyled type="button" onClick={()=>void remove()} disabled={busy}>Delete this story</Button><Button unstyled type="button" onClick={()=>setConfirmDelete(false)}>Keep story</Button></div>}</footer>:<footer className="story-reply"><form onSubmit={e=>{e.preventDefault();void reply();}}><label className="sr-only" htmlFor="story-reply">Reply to this story</label><input id="story-reply" placeholder="Reply to this moment…" maxLength={2000} value={text} disabled={busy} onChange={e=>{setText(e.target.value);setSent(false);}}/><Button unstyled type="submit" aria-label="Send story reply" disabled={busy||!text.trim()}><PrototypeIcon name="next"/></Button></form><small>Your reply includes this exact picture in your private chat.</small>{sent&&<p role="status" className="story-success">Reply sent to your conversation.</p>}</footer>}
 {viewers&&<section className="story-viewers-panel" role="dialog" aria-modal="true" aria-label="Story viewers"><header><h2 className="display">Viewed by {viewers.length}</h2><Button unstyled type="button" className="bare-icon" onClick={()=>setViewers(null)} aria-label="Close viewers"><PrototypeIcon name="close"/></Button></header>{viewers.length?viewers.map(v=><p key={v.id}><b>{v.name||'Freeborn member'}</b><small>{new Date(v.viewedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></p>):<p>No views yet. Your moments can take their time.</p>}</section>}
 </section>;
}

export function StoryRail(){
 const feed=useMemberResource<Feed>('/api/stories');
 const reloadFeed=feed.reload;
 const [view,setView]=useState<'closed'|'compose'|'privacy'|'viewer'>('closed'),[author,setAuthor]=useState<string|null>(null),[returnTo,setReturnTo]=useState<'closed'|'compose'>('closed'),[now,setNow]=useState(()=>Date.now());
 useModalFocus(view!=='closed');
 useEffect(()=>{const timer=setInterval(()=>{setNow(Date.now());void reloadFeed();},15000);return()=>clearInterval(timer);},[reloadFeed]);
 const groups=useMemo(()=>{const grouped=new Map<string,Story[]>();for(const s of feed.data?.stories??[]){if(new Date(s.expiresAt).getTime()<=now)continue;const previous=grouped.get(s.authorId)??[];previous.push(s);grouped.set(s.authorId,previous);}return [...grouped.values()].sort((a,b)=>Number(b[0].authorId===feed.data?.memberId)-Number(a[0].authorId===feed.data?.memberId));},[feed.data,now]);
 const close=()=>{setView('closed');void feed.reload();};
 return <><div className="story-row member-story-rail" aria-label="Stories from your matches"><Button unstyled type="button" className="story-item" onClick={()=>setView('compose')}><span className="story-add"><PrototypeIcon name="plus"/></span><span>Add story</span></Button>{groups.map(group=>{const s=group[0];return <Button unstyled type="button" className="story-item" aria-label={s.authorId===feed.data?.memberId?`View your ${group.length} stories`:`View ${s.name}’s ${group.length} stories`} key={s.authorId} onClick={()=>{setAuthor(s.authorId);setView('viewer');}}><span className={`story-ring ${group.every(s=>s.viewed)?'story-all-seen':''}`}>{s.photo?<PhotoImage src={s.photo} alt="" className="story-avatar" compact/>:<span className="story-avatar story-initial">{s.name[0]}</span>}</span><span>{s.authorId===feed.data?.memberId?'Your story':s.name}</span><small>{group.length}</small></Button>;})}<Button unstyled type="button" className="story-item" onClick={()=>{setReturnTo('closed');setView('privacy');}}><span className="story-settings"><PrototypeIcon name="lock"/></span><span>Audience</span></Button></div>{feed.error&&<p className="story-feed-error" role="alert">Stories couldn’t load. <Button unstyled type="button" onClick={()=>void feed.reload()}>Try again</Button></p>}
 {view!=='closed'&&<div className="member-story-overlay" role="dialog" aria-modal="true" aria-label={view==='compose'?'Share a story':view==='privacy'?'Story privacy':'Story viewer'} onKeyDown={e=>{if(e.key==='Escape'&&view!=='compose')close();}}>{(view==='compose'||view==='privacy'&&returnTo==='compose')&&<div hidden={view!=='compose'}><StoryComposer onClose={close} onPosted={()=>void feed.reload()} onPrivacy={()=>{setReturnTo('compose');setView('privacy');}}/></div>}{view==='privacy'?<StoryPrivacy onClose={()=>setView(returnTo)}/>:view==='viewer'?<StoryViewer key={author} memberId={feed.data?.memberId??''} stories={groups.find(g=>g[0].authorId===author)??[]} onClose={close} onRefresh={()=>void feed.reload()}/>:null}</div>}
 </>;
}
