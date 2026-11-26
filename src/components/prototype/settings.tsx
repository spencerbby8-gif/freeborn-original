"use client";

import { EmailPreferencesCard } from "@/components/app/member-communications";
import { loadFilters, saveFilters } from "@/components/app/filters";
import { FreebornLoader } from "@/components/ui/freeborn-loader";
import { Button } from "@/components/ui/button";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Back, MenuRow, PrototypeIcon } from "./frame";
import { memberRequest, useMemberResource, type Settings } from "./data";

export function ScreenError({message,retry}:{message:string|null;retry?:()=>void}) {
  if (!message) return null;
  return <div role="alert" className="fb-error">{message}{retry && <Button unstyled type="button" onClick={retry} style={{display:'block',marginTop:8,textDecoration:'underline'}}>Try again</Button>}</div>;
}
export function Loading() {return <FreebornLoader/>;}
export function SettingsScreen() {
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  async function logout(){setBusy(true);setError(null);try{const {error}=await createSupabaseBrowserClient().auth.signOut();if(error)throw error;window.location.assign('/auth?mode=sign-in');}catch(e){setError(e instanceof Error?e.message:'Could not sign out.');setBusy(false);}}
  return <section className="screen active" aria-label="Settings"><div className="scroll">
    <div className="bare-head settings-head"><Back/><h1 className="display settings-title">Settings</h1></div>
    <div className="menu-group"><MenuRow href="/app/settings/account" icon="profile">Account</MenuRow><MenuRow href="/app/privacy" icon="shield">Privacy &amp; Safety</MenuRow><MenuRow href="/app/settings/notifications" icon="bell">Notifications</MenuRow><MenuRow href="/app/preferences" icon="filters">Discovery Preferences</MenuRow><MenuRow href="/app/premium" icon="card">Membership · coming later</MenuRow></div>
    <Link href="/app/premium" className="upgrade-banner"><span className="upgrade-crown"><PrototypeIcon name="crown"/></span><span className="upgrade-text"><b>Explore membership</b><small>Explore the planned membership. Not available yet.</small></span><PrototypeIcon name="next" className="chev gold"/></Link>
    <div className="menu-group"><MenuRow href="/app/settings/verification" icon="shield">Verification data &amp; withdrawal</MenuRow><MenuRow href="/app/settings/welcome" icon="info">How to use Freeborn</MenuRow><MenuRow href="/app/settings/support" icon="help">Help &amp; Support</MenuRow><MenuRow href="/app/settings/about" icon="info">About</MenuRow></div><div className="settings-spacer"/>
    <ScreenError message={error}/><Button unstyled className="logout-btn" onClick={()=>void logout()} disabled={busy}>{busy?'Logging out…':'Log out'}</Button>
  </div></section>;
}

const intents=[{value:'long_term',label:'Something real'},{value:'friendship',label:'New friends'},{value:'still_exploring',label:'Not sure yet'}];
const suggestions=['Hiking','Photography','Travel','Matcha','Ambient music','Yoga','Foodie','Art'];
export function PreferencesScreen() {
  const resource=useMemberResource<Settings>('/api/settings');
  if(resource.loading)return <Loading/>;
  if(!resource.data)return <ScreenError message={resource.error} retry={()=>void resource.reload()}/>;
  return <PreferencesForm initial={resource.data}/>;
}
function PreferencesForm({initial}:{initial:Settings}) {
  const [ageMin,setAgeMin]=useState(initial.discovery.ageMin);
  const [ageMax,setAgeMax]=useState(initial.discovery.ageMax);
  const [miles,setMiles]=useState(Math.round(initial.discovery.distanceKm/1.609344));
  const [intent,setIntent]=useState(initial.discovery.relationshipIntents?.[0]??initial.profile.relationshipGoals?.[0]??'');
  const [genders,setGenders]=useState(initial.discovery.showGenders);
  const [interests,setInterests]=useState(initial.profile.interests??[]);
  const [adding,setAdding]=useState(false);const [custom,setCustom]=useState('');
  const [saving,setSaving]=useState(false);const [error,setError]=useState<string|null>(null);const [saved,setSaved]=useState(false);
  const allInterests=[...new Set([...suggestions,...interests])];
  const touch=()=>setSaved(false);
  async function save(){setSaving(true);setError(null);setSaved(false);try{await memberRequest('/api/settings',{profile:{interests},discovery:{ageMin,ageMax,distanceKm:miles>=311?500:Math.min(499,Math.max(5,Math.round(miles*1.609344))),showGenders:genders,relationshipIntents:intent?[intent]:[]}});saveFilters({...loadFilters(),ageMin,ageMax,distance:miles>=311?500:Math.min(499,Math.max(5,Math.round(miles*1.609344))),genders,intents:intent?[intent]:[]});setSaved(true);}catch(e){setError(e instanceof Error?e.message:'Could not save preferences.');}finally{setSaving(false);}}
  return <section className="screen active" aria-label="Discovery preferences"><div className="scroll">
    <div className="bare-head"><Back href="/app/settings"/></div><h1 className="display pref-head">Discovery<br/>Preferences</h1><p className="pref-sub">Find people who fit your world.</p>
    <span className="coral-label pad-x">Looking for</span><div className="pref-pills">{intents.map(x=><Button unstyled key={x.value} aria-pressed={intent===x.value} className={`pref-pill ${intent===x.value?'selected':''}`} onClick={()=>{setIntent(x.value);touch();}}>{x.label}</Button>)}</div>
    <div className="pref-block"><div className="pref-block-head"><span>Age range</span><b>{ageMin} – {ageMax}</b></div><div className="dual-range"><div className="range-track"><div className="range-fill" style={{left:`${(ageMin-18)/81*100}%`,width:`${(ageMax-ageMin)/81*100}%`}}/></div><input aria-label="Minimum age" type="range" min="18" max="99" value={ageMin} onChange={e=>{setAgeMin(Math.min(+e.target.value,ageMax-1));touch();}}/><input aria-label="Maximum age" type="range" min="18" max="99" value={ageMax} onChange={e=>{setAgeMax(Math.max(+e.target.value,ageMin+1));touch();}}/></div></div>
    <div className="pref-block"><div className="pref-block-head"><span>Distance</span><b>{miles>=311?"Anywhere":`Within ${miles} miles`}</b></div><div className="single-range"><div className="range-track single"><div className="range-fill" style={{width:`${miles/311*100}%`}}/></div><input aria-label="Maximum distance" type="range" min="3" max="311" value={miles} onChange={e=>{setMiles(+e.target.value);touch();}}/></div></div>
    <span className="coral-label pad-x">Interests</span><div className="interest-chips">{allInterests.map(x=><Button unstyled key={x} className={`i-chip ${interests.includes(x)?'on':''}`} aria-pressed={interests.includes(x)} onClick={()=>{setInterests(interests.includes(x)?interests.filter(i=>i!==x):[...interests,x].slice(0,20));touch();}}>{x}</Button>)}<Button unstyled className="i-chip add" onClick={()=>setAdding(!adding)}>+ Add more</Button></div>
    {adding&&<form onSubmit={e=>{e.preventDefault();const value=custom.trim();if(value){setInterests([...new Set([...interests,value])].slice(0,20));setCustom('');setAdding(false);touch();}}}><label className="fb-form-field">Add an interest<input value={custom} maxLength={60} onChange={e=>setCustom(e.target.value)} required/></label><Button unstyled className="btn-ghost" style={{margin:'0 22px 12px'}} type="submit">Add interest</Button></form>}
    <span className="coral-label pad-x">Show me</span><div className="pref-pills">{[{label:'Women',value:['woman']},{label:'Men',value:['man']},{label:'Everyone',value:[]}].map(x=><Button unstyled key={x.label} className={`pref-pill ${genders.length===x.value.length&&x.value.every(g=>genders.includes(g))?'selected':''}`} aria-pressed={genders.length===x.value.length&&x.value.every(g=>genders.includes(g))} onClick={()=>{setGenders(x.value);touch();}}>{x.label}</Button>)}</div>
    <ScreenError message={error}/>{saved&&<p role="status" className="fineprint center">Preferences saved.</p>}<div className="pref-foot"><Button unstyled className="btn-grad big wide" onClick={()=>void save()} disabled={saving}>{saving?'Saving…':'Save preferences'}</Button></div>
  </div></section>;
}

export function PrivacyScreen() {
  const resource=useMemberResource<Settings>('/api/settings');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  async function toggle(key:'distance'|'active'|'discoverable'|'receipts'){
    if(!resource.data||busy)return;setBusy(true);setError(null);const s=resource.data;
    const body=key==='discoverable'?{profile:{discoverable:!s.profile.discoverable}}:{privacy:key==='distance'?{hideDistance:!s.privacy.hideDistance}:key==='active'?{hideActiveStatus:!s.privacy.hideActiveStatus}:{readReceipts:!s.privacy.readReceipts}};
    try{await memberRequest('/api/settings',body);await resource.reload();}catch(e){setError(e instanceof Error?e.message:'Could not save privacy setting.');}finally{setBusy(false);}
  }
  const s=resource.data;
  return <section className="screen active" aria-label="Privacy and safety"><div className="scroll"><div className="privacy-head-row"><Back href="/app/settings"/><h1 className="display privacy-title">Privacy &amp;<br/>Safety</h1></div><p className="privacy-sub">Your boundaries, clearly visible and easy to control.</p><Link href="/app/settings/safety" className="safety-center"><span className="safety-ic"><PrototypeIcon name="shield"/></span><span className="safety-text"><b>Safety center</b><small>Block, report and review account protections.</small></span><PrototypeIcon name="next" className="chev"/></Link>
    {resource.loading?<Loading/>:s?<div className="toggle-group">{([{key:'distance',label:'Show my distance',note:'Approximate distance. Hiding it removes you from distance-limited discovery searches.',on:!s.privacy.hideDistance},{key:'active',label:'Show active status',note:'Recent activity, never exact location',on:!s.privacy.hideActiveStatus},{key:'discoverable',label:'Discoverable',note:'Appear in other members’ decks',on:s.profile.discoverable},{key:'receipts',label:'Read receipts',note:'Let matches know when you’ve read',on:s.privacy.readReceipts}] as const).map(t=><div className="toggle-row" key={t.key}><div className="toggle-text"><b>{t.label}</b><small id={t.key==='distance'?'privacy-distance-note':undefined}>{t.note}</small></div><Button unstyled className={`toggle ${t.on?'on':''}`} role="switch" aria-label={t.label} aria-describedby={t.key==='distance'?'privacy-distance-note':undefined} aria-checked={t.on} disabled={busy} onClick={()=>void toggle(t.key)}/></div>)}</div>:null}<ScreenError message={error??resource.error} retry={()=>void resource.reload()}/><div className="menu-group"><MenuRow href="/app/settings/privacy" icon="lock">Who can find &amp; contact me</MenuRow><MenuRow href="/app/settings/stories" icon="eye">Story audience</MenuRow></div>
  </div></section>;
}
export function NotificationSettingsScreen(){
  const resource=useMemberResource<Settings>('/api/settings');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  async function toggle(key:keyof Settings['notifications']){if(!resource.data||busy)return;setBusy(true);setError(null);try{await memberRequest('/api/settings',{notifications:{[key]:!resource.data.notifications[key]}});await resource.reload();}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
  return <section className="screen active"><div className="scroll"><div className="bare-head settings-head"><Back href="/app/settings"/><h1 className="display settings-title">Notifications</h1></div><p className="new-inline-note">Likes, matches and message alerts work while Freeborn is open. Browser alerts need permission. Closed-app push and profile-activity alerts are not available.</p>{resource.loading?<Loading/>:<div className="toggle-group">{([{key:'likeAlerts',label:'Likes'},{key:'messageAlerts',label:'Messages'},{key:'matchAlerts',label:'Matches'}] as const).map(t=><div className="toggle-row" key={t.key}><div className="toggle-text"><b>{t.label}</b></div><Button unstyled className={`toggle ${resource.data?.notifications[t.key]?'on':''}`} role="switch" aria-label={t.label} aria-checked={Boolean(resource.data?.notifications[t.key])} disabled={busy||!resource.data} onClick={()=>void toggle(t.key)}/></div>)}</div>}<ScreenError message={error??resource.error}/><EmailPreferencesCard/></div></section>;
}
export function PremiumScreen(){
  const [plan,setPlan]=useState(1);const [notice,setNotice]=useState(false);
  return <section className="screen active" aria-label="Premium"><div className="scroll premium-scroll"><div className="bare-head"><Back href="/app/settings"/></div><div className="premium-hero"><span className="crown-ring"><PrototypeIcon name="crown"/></span><h1 className="display premium-head">Get more<br/>meaningful matches</h1><p className="premium-sub">A look at the planned membership. These plans are not live or purchasable.</p></div><div className="feature-grid">{['Intentional discovery','Thoughtful conversations','Privacy controls','Profile verification'].map(f=><div className="feature-item" key={f}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#e9c37c"/><path d="M8.3 12.4l2.5 2.5 4.9-5.1" stroke="#241a10" strokeWidth="1.8" fill="none"/></svg><span>{f}</span></div>)}</div><div className="plan-row">{[{len:'1 Month',price:'Not live',save:''},{len:'3 Months',price:'Not live',save:''},{len:'6 Months',price:'Not live',save:''}].map((p,i)=><Button unstyled key={p.len} className={`plan-card ${plan===i?'selected':''}`} aria-pressed={plan===i} onClick={()=>setPlan(i)}>{i===1&&<span className="plan-badge">Coming later</span>}<span className="plan-len">{p.len}</span><span className="plan-price">{p.price}</span>{p.save&&<span className="plan-note">{p.save}</span>}</Button>)}</div><Button unstyled className="btn-grad big" onClick={()=>setNotice(true)}>Check availability</Button>{notice&&<ScreenError message="Purchases are not available yet. No payment was taken and no subscription was created."/>}<p className="fineprint center">Subscriptions are not available yet. No payment will be taken.</p></div></section>;
}
