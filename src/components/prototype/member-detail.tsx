"use client";

import { useEffect, useState } from "react";
import { draftChatHref } from "@/lib/conversation-opener";
import { useRouter } from "next/navigation";
import { memberTapFeedback } from "@/lib/device-prefs";
import { Button } from "@/components/ui/button";
import { PhotoViewer } from "./media";
import { PhotoImage } from "@/components/ui/photo-image";
import { VerifyBadge } from "@/components/verify-badge";
import type { EndConversationKind } from "@/components/app/unmatch-dialog";
import { UNMATCH_REASONS } from "@/lib/match-lifecycle";
import { useModalFocus } from "./modal-focus";
import { formatDistance, useDistanceUnits } from "@/lib/device-prefs";
import type { UnmatchReason } from "@/lib/match-lifecycle";
import { prettyText } from "@/lib/pretty-text";
import { PrototypeIcon, type IconName } from "./frame";
import { memberRequest, useMemberResource, type Match } from "./data";
import { Loading, ScreenError } from "./settings";

export type Detail = {
 id:string;name:string;age:number|null;city:string;region?:string;occupation:string;photos:string[];bio:string;
 relationshipGoals:string[];lifestyle:string[];drinking:string;smoking?:string;language:string;heightCm:number|null;
 interests:string[];values?:string[];verified:boolean;presence:string|null;distanceKm:number|null;messageRestricted?:string|null;
 education?:string;educationLevel?:string;religion?:string;maritalStatus?:string;hasKids?:string;wantsKids?:string;gender?:string;
 dealBreakers?:string[];prompts?:{prompt?:string;answer?:string}[];memberSince?:string|null;birthMonthYear?:string;
 mixerCity?:string|null;vaccinationStatus?:string;inCommon?:{values:string[];interests:string[];lifestyle:string[]}|null;
 visibility?:{visible:boolean;reasons:string[]}|null;
};
const goals:Record<string,string>={long_term:'Something real and meaningful',life_partner:'A life partner',meaningful_connection:'A meaningful connection',friendship:'New friends',still_exploring:'Still figuring it out'};
const reports=[['fake_profile','Fake profile'],['scam','Scam or asking for money'],['harassment','Harassment'],['safety','Safety concern'],['underage','Underage'],['inappropriate_media','Inappropriate photos'],['ai_generated_media','AI-generated media'],['other','Something else']];
export function MemberDetail({profileId,onClose,ownPreview=false,asOthers=false}:{profileId:string;onClose:()=>void;ownPreview?:boolean;asOthers?:boolean}){
 useModalFocus(true);const units=useDistanceUnits();
 const router=useRouter();const resource=useMemberResource<{profile:Detail}>(`/api/profile/${encodeURIComponent(profileId)}${asOthers?'?as=others':''}`);const p=resource.data?.profile;
 const matches=useMemberResource<{matches:Match[]}>('/api/chat/matches');const match=matches.data?.matches.find(m=>m.with.id===profileId);
 const [photoIndex,setPhotoIndex]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);
 const [menu,setMenu]=useState(false);const [action,setAction]=useState<'report'|'block'|null>(null);const [reason,setReason]=useState('');const [end,setEnd]=useState<EndConversationKind|null>(null);const [endReason,setEndReason]=useState<UnmatchReason|null>(null);useModalFocus(Boolean(menu||action||end));
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){if(photoIndex!==null)return;if(action)setAction(null);else if(menu)setMenu(false);else if(end)setEnd(null);else onClose();}};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[onClose,action,menu,end,busy,photoIndex]);
 async function choice(value:'like'|'pass'|'superlike'){memberTapFeedback();setBusy(true);setError(null);try{const r=await memberRequest<{matched?:boolean}>('/api/likes',{profileId,choice:value});if(value==='pass')onClose();else setNotice(r.matched?'It’s mutual — you can now chat.':value==='superlike'?'Spark sent.':'Added to your likes.');}catch(e){setError(e instanceof Error?e.message:'Could not save your choice.');}finally{setBusy(false);}}
 function hello(){router.push(draftChatHref(profileId));}
 async function safety(){setBusy(true);setError(null);try{if(action==='report'){await memberRequest('/api/reports',{profileId,reason});setNotice('Report received for review. Thank you for telling us.');setAction(null);}else if(action==='block'){await memberRequest('/api/blocks',{profileId});onClose();}}catch(e){setError(e instanceof Error?e.message:'Could not complete this action.');}finally{setBusy(false);}}
 async function endConversation(why:UnmatchReason|null){if(!end||!match)return;setBusy(true);setError(null);try{if(end==='unmatch'){await memberRequest('/api/chat/unmatch',{with:profileId,...(why?{reason:why}:{}),destructive:true});onClose();}else{await memberRequest(`/api/chat/messages?match=${encodeURIComponent(match.id)}`,{destructive:true},undefined,'DELETE');setNotice('Every message in this conversation was deleted.');}setEnd(null);setMenu(false);}catch(e){setError(e instanceof Error?e.message:'Could not complete this action.');}finally{setBusy(false);}}
 const tiles=p?([
  {label:'Lifestyle',value:p.lifestyle?.map(prettyText).join(', '),icon:'profile'},
  {label:'Drinks',value:prettyText(p.drinking),icon:'coffee'},
  {label:'Height',value:p.heightCm?`${p.heightCm} cm`:null,icon:'profile'},
  {label:'Languages',value:p.language,icon:'globe'},
  {label:'Occupation',value:p.occupation,icon:'card'},
  {label:'Education',value:[p.education,p.educationLevel].filter(Boolean).join(' · '),icon:'info'},
  {label:'Faith & beliefs',value:p.religion,icon:'star'},
  {label:'Relationship status',value:p.maritalStatus,icon:'heart'},
  {label:'Children',value:p.hasKids,icon:'profile'},
  {label:'Family plans',value:p.wantsKids,icon:'heart'},
  {label:'Smoking',value:p.smoking,icon:'info'},
  {label:'Gender',value:p.gender,icon:'profile'},
  {label:'Location',value:[p.city,p.region].filter(Boolean).join(', '),icon:'discover'},
  {label:'Vaccination · self-reported',value:p.vaccinationStatus&&p.vaccinationStatus!=='prefer_not_to_say'?p.vaccinationStatus:null,icon:'shield'},
  {label:'Open to meeting',value:p.mixerCity,icon:'discover'},
  {label:'Distance',value:p.distanceKm!=null?formatDistance(p.distanceKm,units):null,icon:'discover'},
  {label:'Member since',value:p.memberSince?new Date(p.memberSince).toLocaleDateString(undefined,{month:'long',year:'numeric'}):null,icon:'info'},
 ] as {label:string;value?:string|null;icon:IconName}[]).filter(t=>t.value):[];
 const shared=p?.inCommon?Array.from(new Set([...p.inCommon.values,...p.inCommon.interests,...p.inCommon.lifestyle])):[];
 return <div className="fb-detail-overlay new-member-detail" role="dialog" aria-modal="true" aria-label="Member profile"><section className="screen active"><div className="scroll pd-scroll">{resource.loading?<Loading/>:p?<>
  <div className="pd-hero">{p.photos[0]?<button type="button" className="reference-profile-cover" aria-label={`Enlarge ${p.name} photo 1`} onClick={()=>setPhotoIndex(0)}><PhotoImage src={p.photos[0]} alt={p.name} className="w-full h-full" imgClassName="object-cover"/></button>:<div className="fb-placeholder">{p.name.slice(0,1)}</div>}<div className="pd-shade"/><div className="pd-topbar"><Button unstyled className="bare-icon" aria-label="Back" onClick={onClose}><PrototypeIcon name="back"/></Button>{!ownPreview&&<Button unstyled className="bare-icon" aria-label="Profile actions" aria-expanded={menu} onClick={()=>setMenu(!menu)}><PrototypeIcon name="more"/></Button>}</div><div className="pd-id"><h1 className="pd-name">{p.name} {p.verified&&<VerifyBadge size={19}/>}</h1><p className="pd-sub">{[p.age,p.occupation,p.city].filter(Boolean).join(' · ')}</p>{p.presence&&p.presence!=='hidden'&&<p className="pd-active"><span className="pulse-dot"/>{p.presence==='now'?'Active now':p.presence==='today'?'Active today':'Active this week'}</p>}</div>{!ownPreview&&<Button unstyled className="pd-fab" aria-label={`Like ${p.name}`} disabled={busy} onClick={()=>void choice('like')}><PrototypeIcon name="heart"/></Button>}</div>
  <div className="pd-body">{p.visibility&&<p className="new-inline-note">{p.visibility.visible?'Your profile is visible to eligible members.':p.visibility.reasons.join(' ')}</p>}{p.relationshipGoals?.length>0&&<div className="looking-for"><div><span className="coral-label">Looking for</span><h2 className="looking-for-text">{p.relationshipGoals.map(g=>goals[g]??prettyText(g)).join(' · ')}</h2></div><PrototypeIcon name="heart" className="neon-heart"/></div>}
  {tiles.length>0&&<div className="info-grid">{tiles.slice(0,4).map(t=><div className="info-tile" key={t.label}><span className="tile-ic"><PrototypeIcon name={t.icon}/></span><span className="tile-text"><span className="tile-label">{t.label}</span><span className="tile-value">{prettyText(t.value)}</span></span></div>)}</div>}
  {(p.bio||p.interests?.length>0)&&<div className="about-panel">{p.bio&&<><h2 className="coral-label">About me</h2><p className="pd-about">{p.bio}</p></>}{p.interests?.length>0&&<><h2 className="coral-label">My passions</h2><div className="chip-row">{p.interests.map(i=><span key={i}>{i}</span>)}</div></>}</div>}
  {shared.length>0&&<div className="about-panel pd-extra"><h2 className="coral-label">Our common ground</h2><div className="chip-row">{shared.map(v=><span key={v}>{v}</span>)}</div></div>}
  {tiles.length>4&&<div className="info-grid">{tiles.slice(4).map(t=><div className="info-tile" key={t.label}><span className="tile-ic"><PrototypeIcon name={t.icon}/></span><span className="tile-text"><span className="tile-label">{t.label}</span><span className="tile-value">{prettyText(t.value)}</span></span></div>)}</div>}
  {p.values&&p.values.length>0&&<div className="about-panel pd-extra"><h2 className="coral-label">What matters to me</h2><div className="chip-row">{p.values.map(v=><span key={v}>{v}</span>)}</div></div>}
  {p.prompts?.filter(q=>q.answer).map((q,i)=><div className="about-panel pd-extra" key={i}><h2 className="coral-label">{q.prompt||'A little more about me'}</h2><p className="pd-about">{q.answer}</p></div>)}
  {p.photos.slice(1).map((src,i)=><button key={`${src}-${i}`} type="button" className="reference-profile-photo" aria-label={`Enlarge ${p.name} photo ${i+2}`} onClick={()=>setPhotoIndex(i+1)}><PhotoImage className="pd-full-photo" src={src} alt={`${p.name}, photo ${i+2}`}/></button>)}
  {p.dealBreakers&&p.dealBreakers.length>0&&<div className="about-panel pd-extra"><h2 className="coral-label">My boundaries</h2><div className="chip-row">{p.dealBreakers.map(v=><span key={v}>{v}</span>)}</div></div>}
  <ScreenError message={error}/>{notice&&<p role="status" className="new-inline-note">{notice}</p>}<div className="pd-spacer"/></div>
 </>:<><Button unstyled className="bare-icon" aria-label="Back" onClick={onClose}><PrototypeIcon name="back"/></Button><ScreenError message={resource.error??'This profile is not available.'} retry={()=>void resource.reload()}/></>}</div>
 {p&&!ownPreview&&<div className="action-row dock-bottom"><Button unstyled className="circle-btn" aria-label="Pass" disabled={busy} onClick={()=>void choice('pass')}><PrototypeIcon name="close"/></Button><Button unstyled className="say-hello" disabled={busy} onClick={()=>void hello()}><PrototypeIcon name="heart"/>Say hello</Button><Button unstyled className="circle-btn" aria-label="Spark" disabled={busy} onClick={()=>void choice('superlike')}><PrototypeIcon name="flame"/></Button></div>}</section>
 {menu&&<div className="new-sheet-shade" onClick={()=>setMenu(false)}><div className="new-sheet" role="dialog" aria-modal="true" aria-label="Profile actions" onClick={e=>e.stopPropagation()}><div className="sub-head end"><h2 className="display">{p?.name}</h2><Button unstyled className="bare-icon" aria-label="Close profile actions" onClick={()=>setMenu(false)}><PrototypeIcon name="close"/></Button></div><Button unstyled onClick={()=>{setAction('report');setMenu(false);}}>Report this member</Button><Button unstyled onClick={()=>{setAction('block');setMenu(false);}}>Block this member</Button>{match&&<><Button unstyled onClick={()=>{setEnd('unmatch');setMenu(false);}}>End conversation</Button><Button unstyled onClick={()=>{setEnd('delete');setMenu(false);}}>Delete conversation</Button></>}</div></div>}
 {action&&<div className="new-sheet-shade"><div className="new-sheet" role="dialog" aria-modal="true" aria-label={action==='report'?'Report member':'Block member'}><h2 className="display">{action==='report'?'Tell us what happened':'Block this member?'}</h2><p>{action==='report'?'Your report is private and is reviewed. A report alone is not a verdict.':'You won’t see each other or be able to contact each other. You can manage blocked accounts in Privacy & Safety.'}</p>{action==='report'&&<label className="new-field">Reason<select aria-label="Reason" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Choose a reason</option>{reports.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}<ScreenError message={error}/><Button unstyled className="btn-grad wide" disabled={busy||(action==='report'&&!reason)} onClick={()=>void safety()}>{busy?'Sending…':action==='report'?'Submit report':'Block member'}</Button><Button unstyled className="btn-ghost wide" onClick={()=>setAction(null)} disabled={busy}>Cancel</Button></div></div>}
 {end&&<div className="new-sheet-shade"><div className="new-sheet" role="dialog" aria-modal="true" aria-label={end==='unmatch'?'End this conversation?':'Delete every message?'}><h2 className="display">{end==='unmatch'?'End this conversation?':'Delete every message?'}</h2>{end==='unmatch'?<p>This can’t be undone. You’ll lose this conversation, including its photos and voice notes. {p?.name} keeps a read-only copy so they can still report what was sent. You won’t be able to message or match again.</p>:<p>Every message is removed for both of you, including photos and voice notes. You stay matched, so you can still message each other. This can’t be undone.</p>}{end==='unmatch'&&<label className="new-field">Reason (optional)<select value={endReason??''} onChange={e=>setEndReason((e.target.value||null) as UnmatchReason|null)}><option value="">Prefer not to say</option>{UNMATCH_REASONS.map(v=><option key={v} value={v}>{prettyText(v)}</option>)}</select></label>}<ScreenError message={error}/><Button unstyled className="logout-btn" disabled={busy} onClick={()=>void endConversation(end==='unmatch'?endReason:null)}>{busy?'Working…':end==='unmatch'?'End conversation':'Delete messages'}</Button><Button unstyled className="btn-ghost wide" disabled={busy} onClick={()=>{setEnd(null);setAction('report');}}>Report instead</Button><Button unstyled className="btn-ghost wide" disabled={busy} onClick={()=>setEnd(null)}>Keep conversation</Button></div></div>}
 {p&&photoIndex!==null&&<PhotoViewer photos={p.photos} name={p.name} initialIndex={photoIndex} onClose={()=>setPhotoIndex(null)}/>}
 </div>;
}
