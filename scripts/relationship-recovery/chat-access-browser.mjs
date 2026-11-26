// LOCAL ONLY: two synthetic Chromium contexts + real local chat and block routes.
// Supabase Auth and Realtime are substituted. This is not hosted acceptance.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const base='http://127.0.0.1:3000',out='/home/user/freeborn-audit/chat-access-browser';await fs.mkdir(out,{recursive:true});
const h=await createHarness({routes:{blocks:'src/app/api/blocks/route.ts',unmatch:'src/app/api/chat/unmatch/route.ts'}});await h.seed();
assert.equal((await h.request('messages','POST','b',{match:IDS.match,text:'History preserved for evidence'})).status,200);
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const contexts=[],errors=[];const wire={a:[],b:[]},joined={};let mode='normal', heldResolve, heldReadyResolve;
let heldReady=new Promise(r=>{heldReadyResolve=r});
async function contextFor(who){
 const id=IDS[who],user={id,email:`qa-${who}@example.test`,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const jwt=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const c=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce',permissions:['camera','microphone']});contexts.push(c);
 await c.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__testMicTracks=[];navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await original(...args);window.__testMicTracks.push(...stream.getTracks());return stream;};});
 await c.addInitScript(session=>{localStorage.setItem('sb-fixture-auth-token',JSON.stringify(session));localStorage.setItem('fb-notif-asked','1');sessionStorage.setItem('fb-security-checked',String(Date.now()));},{access_token:jwt,refresh_token:'local-fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user});
 // Protocol shim exercises client behavior only; it is NOT Supabase Realtime or an RLS test.
 joined[who]={};joined[who].ready=new Promise(r=>{joined[who].resolve=r});
 await c.routeWebSocket('wss://fixture.supabase.co/**',ws=>ws.onMessage(raw=>{
  let frame;
  if(typeof raw==='string'){
   try{const [join_ref,ref,topic,event,payload]=JSON.parse(raw);frame={join_ref,ref,topic,event,payload}}catch{return;}
  }else{
   const buf=Buffer.from(raw);if(buf[0]!==3||buf.length<7)return;
   const [j,r,t,e,m]=[...buf.subarray(1,6)];let n=7;
   const read=len=>{const value=buf.subarray(n,n+len).toString('utf8');n+=len;return value};
   const join_ref=read(j),ref=read(r),topic=read(t),eventName=read(e);read(m);
   let payload;try{payload=JSON.parse(buf.subarray(n).toString('utf8'))}catch{return;}
   frame={join_ref,ref,topic,event:'broadcast',payload:{event:eventName,payload}};
  }
  if(frame.topic?.startsWith('realtime:fb-chat:'))wire[who].push(frame);
  if(['phx_join','phx_leave','broadcast','heartbeat'].includes(frame.event)){
   ws.send(JSON.stringify([frame.join_ref,frame.ref,frame.topic,'phx_reply',{status:'ok',response:{}}]));
   if(frame.event==='phx_join'&&frame.topic?.startsWith('realtime:fb-chat:')){joined[who].emit=kind=>ws.send(JSON.stringify([frame.ref,null,frame.topic,'broadcast',{event:'fb-message',payload:{kind}}]));joined[who].resolve();}
  }
 }));
 await c.route('https://fixture.supabase.co/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:[],headers:{'access-control-allow-origin':'*'}}));
 const mappings=[[/^\/api\/blocks$/,'blocks'],[/^\/api\/chat\/matches$/,'matches'],[/^\/api\/notifications$/,'notifications'],[/^\/api\/chat\/messages$/,'messages'],[/^\/api\/stories$/,'stories'],[/^\/api\/stories\/privacy$/,'privacy']];
 await c.route(base+'/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname,m=mappings.find(([re])=>re.test(p));
  if(who==='a'&&p==='/api/chat/messages'&&req.method()==='GET'&&mode==='503'){await route.fulfill({status:503,json:{error:'Synthetic temporary failure'}});return;}
  if(who==='a'&&p==='/api/chat/messages'&&req.method()==='GET'&&mode==='404'){await route.fulfill({status:404,json:{code:'thread_unavailable',error:'Match not found.'}});return;}
  if(m){
   const headers=new Headers(req.headers());headers.set('authorization','Bearer '+id);headers.delete('host');headers.delete('content-length');
   const response=await h.routes[m[1]][req.method()](new Request(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer()}),{params:Promise.resolve({})});
   const status=response.status,body=Buffer.from(await response.arrayBuffer()),responseHeaders=Object.fromEntries(response.headers);
   if(who==='a'&&p==='/api/chat/messages'&&req.method()==='GET'&&mode==='hold-one'&&status===200){mode='normal';heldReadyResolve();await new Promise(r=>{heldResolve=r});}
   await route.fulfill({status,headers:responseHeaders,body}).catch(()=>{});return;
  }
  let data={ok:true};if(p==='/api/chat/requests')data={incoming:[],outgoing:[]};else if(p==='/api/settings')data={profile:{displayName:h.identities[id].name,discoverable:false},privacy:{},discovery:{},notifications:{},account:{email:user.email}};else if(p==='/api/verification')data={verified:true,status:'approved'};else if(p==='/api/likes')data={liked:[],likedYou:[]};else if(p==='/api/profile/me')data={profile:{id,displayName:h.identities[id].name,photos:[],interests:[],values:[],relationshipGoals:[],isVerified:true}};await route.fulfill({json:data});
 });return c;
}
async function refresh(page,status){const received=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/chat/messages'&&r.request().method()==='GET'&&r.status()===status,{timeout:12000});await page.evaluate(()=>window.dispatchEvent(new Event('online')));await received;}
try{
 const ca=await contextFor('a'),cb=await contextFor('b'),a=await ca.newPage(),b=await cb.newPage();for(const p of [a,b]){p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));}
 for(const p of [a,b]){await p.goto(base+'/app/chat?match='+IDS.match,{waitUntil:'domcontentloaded'});await p.getByText('History preserved for evidence',{exact:true}).waitFor().catch(async e=>{console.error('PAGE',p.url(),(await p.locator('body').innerText()).slice(0,1600),'errors',errors);await p.screenshot({path:out+'/initial-failure.png'});throw e});await p.getByRole('textbox',{name:'Message'}).waitFor();}
 await Promise.race([Promise.all([joined.a.ready,joined.b.ready]),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('mock chat socket did not join')),10000);timer.unref();})]);
 joined.b.emit('typing');await b.getByRole('status',{name:'QA River is typing'}).waitFor();
 mode='503';await refresh(a,503);assert.equal(await a.getByText('History preserved for evidence',{exact:true}).isVisible(),true);assert.equal(await a.getByRole('textbox',{name:'Message'}).isVisible(),true);console.log('PASS transient 503 keeps existing thread and composer');mode='normal';
 await a.getByRole('textbox',{name:'Message'}).fill('Unsent draft retained');
 await b.getByRole('textbox',{name:'Message'}).fill('typing before block');
 await new Promise(r=>setTimeout(r,100));assert.ok(wire.b.some(x=>x.event==='broadcast'&&x.payload?.payload?.kind==='typing'),'fixture must observe a real client typing frame');
 await b.getByRole('button',{name:'Record a voice note'}).click();await b.getByRole('dialog',{name:'Voice note'}).waitFor();await b.getByRole('button',{name:'Start recording'}).click();await b.getByRole('button',{name:'Stop recording'}).waitFor();assert.equal(await b.evaluate(()=>window.__testMicTracks.some(t=>t.readyState==='live')),true);
 mode='hold-one';await a.evaluate(()=>window.dispatchEvent(new Event('online')));await heldReady;
 const typingStopsBefore=wire.b.filter(x=>x.event==='broadcast'&&x.payload?.payload?.kind==='typing-stop').length;assert.equal(typingStopsBefore,0,'typing-stop timer should still be pending before block');
 assert.equal((await h.request('blocks','POST','a',{profileId:IDS.b})).status,200);
 // Seed a synthetic pre-existing unread row after the boundary so the open
 // browser cannot have marked it read before the block committed.
 const unreadBlock=(await h.client.query("insert into messages(match_id,sender_id,body) values($1,$2,'Blocked unread fixture') returning id",[IDS.match,IDS.a])).rows[0].id;
 await refresh(a,403);await a.getByRole('alert').filter({hasText:'This conversation is not available.'}).waitFor();assert.equal(await a.getByText('History preserved for evidence',{exact:true}).count(),0);assert.equal(await a.getByRole('textbox',{name:'Message'}).count(),0);
 await refresh(b,200);await b.getByText('History preserved for evidence',{exact:true}).waitFor();await b.getByText('Blocked unread fixture',{exact:true}).waitFor();assert.equal((await h.client.query('select read_at from messages where id=$1',[unreadBlock])).rows[0].read_at,null);await b.locator('[data-readonly-thread]').waitFor();assert.match(await b.locator('[data-readonly-thread]').innerText(),/can't message this member/);assert.equal(await b.getByRole('textbox',{name:'Message'}).count(),0);await b.getByRole('dialog',{name:'Voice note'}).waitFor({state:'detached'});await b.waitForFunction(()=>window.__testMicTracks.every(t=>t.readyState==='ended'));assert.equal(wire.b.filter(x=>x.event==='broadcast'&&x.payload?.payload?.kind==='typing-stop').length,typingStopsBefore,'typing-stop must still be pending when denial is applied');
 const count=wire.b.filter(x=>x.event==='broadcast').length;joined.b.emit('typing');heldResolve();await b.waitForTimeout(1100);
 assert.equal(await b.getByRole('status',{name:'QA River is typing'}).count(),0,'read-only thread must ignore incoming typing');assert.equal(wire.b.filter(x=>x.event==='broadcast').length,count,'typing timer must not broadcast after read-only verdict');console.log('PASS read-only history, recorder microphone stop, and cancellation of pending typing signal (socket shim)');
 assert.equal(await a.getByRole('alert').filter({hasText:'This conversation is not available.'}).isVisible(),true);assert.equal(await a.getByText('History preserved for evidence',{exact:true}).count(),0);await a.screenshot({path:out+'/blocker-unavailable.png'});console.log('PASS real block yields unavailable UI and delayed pre-block success cannot reopen it');
 assert.equal((await h.request('blocks','DELETE','a',{profileId:IDS.b})).status,200);
 await refresh(a,200);await a.getByText('History preserved for evidence',{exact:true}).waitFor();assert.equal(await a.getByRole('textbox',{name:'Message'}).inputValue(),'Unsent draft retained');await refresh(b,200);await b.getByRole('textbox',{name:'Message'}).waitFor();assert.ok((await h.client.query('select read_at from messages where id=$1',[unreadBlock])).rows[0].read_at);console.log('PASS unblock restores both chat and unsent draft; unread receipt recorded only after restoration');
 mode='404';await refresh(a,404);await a.getByRole('alert').filter({hasText:'This conversation is not available.'}).waitFor();mode='503';await refresh(a,503);assert.equal(await a.getByRole('alert').filter({hasText:'This conversation is not available.'}).isVisible(),true);mode='normal';await refresh(a,200);await a.getByText('History preserved for evidence',{exact:true}).waitFor();console.log('PASS coded 404 hides content, temporary failure cannot undo denial, successful retry restores');
 const stranger=await h.request('messages','GET','c');assert.equal(stranger.status,404);assert.equal((await stranger.json()).code,'thread_unavailable');
 assert.equal((await h.request('unmatch','POST','a',{with:IDS.b,destructive:true})).status,200);const unreadEnded=(await h.client.query("insert into messages(match_id,sender_id,body) values($1,$2,'Unmatched unread fixture') returning id",[IDS.match,IDS.a])).rows[0].id;await refresh(a,403);await a.getByRole('alert').filter({hasText:'This conversation is not available.'}).waitFor();await refresh(b,200);await b.locator('[data-readonly-thread]').waitFor();await b.getByText('History preserved for evidence',{exact:true}).waitFor();await b.getByText('Unmatched unread fixture',{exact:true}).waitFor();assert.equal((await h.client.query('select read_at from messages where id=$1',[unreadEnded])).rows[0].read_at,null);assert.equal((await h.request('messages','POST','b',{match:IDS.match,text:'Post-unmatch message'})).status,403);console.log('PASS real unmatch hides actor view and preserves other participant evidence without read receipt; stranger receives coded 404');
 assert.deepEqual(errors,[]);console.log('LIMIT Auth/Realtime are substituted; no cached-socket or hosted proof');
} finally {if(heldResolve)heldResolve();for(const c of contexts)await c.close();await browser.close();await h.close();}
