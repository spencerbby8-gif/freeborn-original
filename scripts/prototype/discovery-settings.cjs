// Local-only API/WebSocket fixtures; never hosted email, RLS or physical-device acceptance.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3000';
const output=process.env.FREEBORN_UI_OUTPUT||'scripts/prototype/.shots/discovery-settings';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local server only');
const id='f5166a7e-1480-40a5-a770-146fb8cfd007',peer='f5166a7e-1480-40a5-a770-146fb8cfd008',match='f5166a7e-1480-40a5-a770-146fb8cfd009';
const mediaId='f5166a7e-1480-40a5-a770-146fb8cfd011';
const user={id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
function session(){return {access_token:Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user};}
const deck={id:peer,name:'Aria',age:27,city:'Brooklyn',occupation:'Designer',headline:'A curious mind and a kind heart.',traits:['Hiking','Coffee','Music'],photo:'/images/prototype/welcome.jpg',photos:['/images/prototype/welcome.jpg'],verified:true,presence:'today',distanceKm:10,isNew:true};
const draft={display_name:'Taylor',birth_date:'1998-01-02',gender:'woman',city:'Brooklyn',region:'New York',relationship_goals:['long_term'],values:['Health autonomy'],bio:'I love long walks, thoughtful conversations and good coffee.',interests:['Hiking','Coffee','Reading'],lifestyle_preferences:['Natural living'],photos:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const results={scope:'Local intercepted APIs + fake microphone + loopback WebSocket. No hosted delivery, inbox, biometric or RLS acceptance.',checks:[],captures:[],errors:[]};
 for(const viewport of [{width:393,height:852},{width:1440,height:1000}].filter(v=>!process.env.FREEBORN_UI_VIEWPORT||v.width===Number(process.env.FREEBORN_UI_VIEWPORT))){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce',permissions:['microphone','camera'],acceptDownloads:true});
  await ctx.addInitScript(s=>{localStorage.setItem('sb-fixture-auth-token',JSON.stringify(s));sessionStorage.setItem('fb-security-checked',String(Date.now()));},session());
  const profileQueries=[];let chatDelay=0;let incomingCall=null;let settingsState={account:{email:'fixture@example.test'},profile:{displayName:'Taylor',city:'Abuja',interests:[],relationshipGoals:['long_term'],discoverable:true,messagePrivacy:'everyone',discoverPrivacy:'everyone'},discovery:{relationshipIntents:[],ageMin:18,ageMax:99,distanceKm:500,showGenders:[],verifiedOnly:false,photosRequired:true,vaccinationPreference:'any'},privacy:{hideDistance:false,hideActiveStatus:false,readReceipts:true},notifications:{matchAlerts:true,messageAlerts:true,likeAlerts:true,profileActivity:true}};
  let delaySetup=false,step='welcome',stepDraft=structuredClone(draft),completed=false,rejectChoice=false,failUpload=false,uploadCount=0,choiceCount=0,verifyInvalid=true,onboardingFail=false;
  let messages=[],writes=[],authWrites=[],sockets=[],sentSignals=[],mediaStore=new Map();
  await ctx.routeWebSocket('wss://fixture.supabase.co/**',ws=>{
   let topic='',joinRef=null;sockets.push({ws,get topic(){return topic},get joinRef(){return joinRef}});
   ws.onMessage(raw=>{if(typeof raw!=='string'){const b=Buffer.from(raw);if(b[0]===3){const jr=b.subarray(7,7+b[1]).toString(),ref=b.subarray(7+b[1],7+b[1]+b[2]).toString();const offset=7+b[1]+b[2]+b[3]+b[4]+b[5];const data=JSON.parse(b.subarray(offset).toString());sentSignals.push(data);ws.send(JSON.stringify([jr,ref,topic,'phx_reply',{status:'ok',response:{}}]));}return;}const m=JSON.parse(raw);if(!Array.isArray(m))return;const [jr,ref,t,event,payload]=m;
    if(event==='phx_join'){topic=t;joinRef=jr;ws.send(JSON.stringify([jr,ref,t,'phx_reply',{status:'ok',response:{postgres_changes:(payload.config?.postgres_changes||[]).map((v,i)=>({...v,id:i+1}))}}]));}
    else if(event==='heartbeat')ws.send(JSON.stringify([null,ref,t,'phx_reply',{status:'ok',response:{}}]));
   });
  });
  await ctx.route('https://fixture.supabase.co/**',async r=>{
   const req=r.request(),p=new URL(req.url()).pathname;if(p.endsWith('/broadcast'))return r.fulfill({status:202,json:{}});let data=user,status=200;
   if(req.method()==='POST'){const body=req.postDataJSON();authWrites.push({p,body});if(p.endsWith('/signup'))data={user,session:null};else if(p.endsWith('/verify')){if(verifyInvalid){status=403;data={msg:'Token has expired or is invalid',error_code:'otp_expired'};}else data={...session(),user};}else data={};}
   await r.fulfill({status,json:data,headers:{'access-control-allow-origin':'*'}});
  });
  await ctx.route(base+'/api/**',async r=>{
   const req=r.request(),p=new URL(req.url()).pathname;if(p==='/api/profiles')profileQueries.push(new URL(req.url()).searchParams.toString());let data={ok:true},status=200;
   if(req.method()==='POST'){
    let body={};try{body=req.postDataJSON()}catch{}writes.push({p,body,auth:!!req.headers().authorization,raw:req.postDataBuffer()?.toString('latin1')});
    if(p==='/api/settings'){for(const key of Object.keys(body))Object.assign(settingsState[key]??={},body[key]);}
    if(p==='/api/calls/session')data={id:mediaId,matchId:match,kind:body.kind,status:'ringing',peer:{id:peer,name:'Maya',photo:'/images/prototype/welcome.jpg'},self:{id,name:'Taylor',photo:''}};
    if(p==='/api/onboarding'){if(onboardingFail){status=503;data={error:'Fixture save unavailable'};}else Object.assign(stepDraft,body.patch);}
    if(p==='/api/onboarding/complete'){completed=true;data={ok:true};}
    if(p==='/api/likes'){choiceCount++;await new Promise(r=>setTimeout(r,500));if(rejectChoice){status=403;data={error:'Fixture like refused'};}}
    if(p==='/api/chat/media'){uploadCount++;if(failUpload){status=503;data={error:'Fixture upload unavailable'};}else {const form=await new Request('http://local.test',{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData();const file=form.get('file');const key=`f5166a7e-1480-40a5-a770-${String(100+uploadCount).padStart(12,'0')}`;mediaStore.set(key,{bytes:Buffer.from(await file.arrayBuffer()),mime:file.type});data={ok:true,id:key,kind:form.get('kind')};if(process.env.FREEBORN_UI_DEBUG)console.log('UPLOAD',key,form.get('kind'),mediaStore.get(key).mime,mediaStore.get(key).bytes.length,mediaStore.get(key).bytes.subarray(0,12));}}
    if(p==='/api/chat/messages'){const row={id:`msg-${messages.length}`,mine:true,body:body.text,at:new Date().toISOString(),reactions:[]};messages.push(row);data={message:{id:row.id,at:row.at}};}
   }else if(p==='/api/onboarding/state'){if(delaySetup)await new Promise(r=>setTimeout(r,1500));data={completed,initialStep:step,draft:stepDraft};}
   else if(p==='/api/settings')data=settingsState;
   else if(p==='/api/profiles')data={profiles:[{...deck,id:peer,name:'Maya',gender:'woman',photo:'/__fixture/woman.jpg',photos:['/__fixture/woman.jpg'],vaccinationStatus:'unvaccinated',relationshipGoals:['long_term'],lifestyle:['Natural living'],interests:['Hiking']},{...deck,id:mediaId,name:'Daniel',gender:'man',photo:'/images/samples/caleb.jpg',photos:['/images/samples/caleb.jpg'],vaccinationStatus:'unvaccinated',relationshipGoals:['friendship'],lifestyle:['Active lifestyle'],interests:['Reading']},{...deck,id:'unverified',name:'Unverified',verified:false,vaccinationStatus:'unvaccinated'}]};
   else if(p==='/api/account')data={email:'fixture@example.test',createdAt:new Date().toISOString(),activeSignIns:1};
   else if(p==='/api/blocks')data={blocked:[]};
   else if(p==='/api/calls/session')data={incoming:incomingCall};
   else if(p==='/api/calls/session/'+mediaId)data=incomingCall??{id:mediaId,status:'ended'};
   else if(p==='/api/calls/ice')data={iceServers:[],relayConfigured:false};
   else if(p==='/api/profile/me')data={profile:{id,displayName:'Taylor',photos:[],interests:[],relationshipGoals:[],isVerified:true}};
   else if(p==='/api/verification')data={verified:true,status:'approved'};
   else if(p==='/api/chat/matches')data={matches:[{id:match,with:{id:peer,name:'Maya',city:'Brooklyn',photo:'/images/prototype/welcome.jpg',verified:true,active:true},createdAt:new Date().toISOString(),ended:false,unread:0}]};
   else if(p==='/api/chat/messages'){if(chatDelay)await new Promise(r=>setTimeout(r,chatDelay));data={messages,thread:{canSend:true,status:'active',reason:null,notice:null}};}
   else if(p==='/api/chat/requests')data={incoming:[],outgoing:[]};
   else if(p==='/api/notifications')data={notifications:[]};
   else if(p.startsWith('/api/chat/media/')){const item=mediaStore.get(p.split('/').at(-1));if(process.env.FREEBORN_UI_DEBUG)console.log('READ',p,item?.bytes.length,item?.mime);return r.fulfill({body:item?.bytes??Buffer.from('missing'),headers:{'content-type':item?.mime??'application/octet-stream','content-disposition':'attachment'}});}
   else if(p==='/api/likes')data={liked:[],likedYou:[]};
   else if(p==='/api/security/location')data={ok:true};
   await r.fulfill({status,json:data});
  });
  await ctx.route(base+'/__fixture/woman.jpg',async r=>r.fulfill({body:await fs.readFile('scripts/prototype/fixtures/maya.jpg'),contentType:'image/jpeg'}));
  await ctx.route('https://api.bigdatacloud.net/**',r=>r.fulfill({json:{city:'Warri'}}));
  const page=await ctx.newPage();page.setDefaultTimeout(9000);page.on('pageerror',e=>results.errors.push(e.message));
  const dir=`${output}/${viewport.width}x${viewport.height}`;await fs.mkdir(dir,{recursive:true});
  const check=async(name,fn)=>{try{await fn();results.checks.push({viewport,name,ok:true});console.log('PASS',viewport.width,name);}catch(e){results.checks.push({viewport,name,ok:false,error:e.message});console.error('FAIL',viewport.width,name,e.message);if(process.env.FREEBORN_UI_DEBUG)console.log('AUDIO STATE',await page.locator('audio').evaluateAll(es=>es.map(e=>({html:e.outerHTML,ready:e.readyState,error:e.error?.message,paused:e.paused,time:e.currentTime}))),await page.locator('.reference-voice-bubble').allTextContents());}};
  const capture=async name=>{await page.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});results.captures.push({viewport,name});};
  await check('Worldwide discovery has an honest generic heading and a woman reference card',async()=>{
   await page.goto(base+'/app',{waitUntil:'networkidle'});await page.locator('.card-name').filter({hasText:'Maya'}).waitFor();await page.getByText('Date like you mean it',{exact:true}).waitFor();if(await page.getByText('Tonight in Brooklyn',{exact:false}).count())throw Error('Candidate location used');const geometry=await page.evaluate(()=>{const actions=document.querySelector('.discover-actions').getBoundingClientRect(),tabs=document.querySelector('.tabbar').getBoundingClientRect();return {actionsBottom:actions.bottom,tabsTop:tabs.top};});if(geometry.actionsBottom>geometry.tabsTop)throw Error('Discovery actions hidden under tabs '+JSON.stringify(geometry));await capture('discover-woman');
  });
  await check('Badge explains self-report once; member chips change with the swipe; no badge for unverified',async()=>{
   await page.getByText('What this means',{exact:true}).waitFor();await page.getByText('Vaccination status is self-reported, not medically verified.',{exact:false}).waitFor();await page.getByRole('button',{name:'Dismiss badge explanation',exact:true}).click();
   const chips=page.getByLabel('Current member’s profile details');if(!(await chips.innerText()).includes('Long-term'))throw Error('Wrong current intention');await page.getByRole('button',{name:'Pass',exact:true}).click();await page.locator('.card-name').filter({hasText:'Daniel'}).waitFor();if(!(await chips.innerText()).includes('Friendship')||!(await chips.innerText()).includes('Reading')||(await chips.innerText()).includes('Long-term'))throw Error('Stale chips');if(await page.getByText('What this means',{exact:true}).count())throw Error('Badge auto-tip repeated');await capture('discover-man');await page.getByRole('button',{name:'Pass',exact:true}).click();await page.getByRole('heading',{name:'Unverified',exact:true}).waitFor();if(await page.locator('.unvaccinated-badge').count())throw Error('Badge on unverified profile');
  });
  await check('Reset/everybody clears saved photo, gender, verified and distance restrictions',async()=>{
   await page.getByRole('button',{name:'Discovery filters',exact:true}).click();await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByRole('button',{name:'Save preferences',exact:true}).click();await page.getByRole('dialog',{name:'Discovery filters'}).waitFor({state:'hidden'});const write=writes.filter(w=>w.p==='/api/settings').at(-1);if(!write.auth||write.body.discovery.showGenders.length||write.body.discovery.verifiedOnly||write.body.discovery.photosRequired!==false||write.body.discovery.distanceKm!==500)throw Error('Everyone reset did not clear restrictions');
  });
  await check('Verified-only is an authenticated persisted filter, not a decorative toggle',async()=>{
   await page.getByRole('button',{name:'Discovery filters',exact:true}).click();await page.locator('.new-accordion summary').click();await page.getByRole('switch',{name:'Verified only',exact:true}).click();await page.getByRole('button',{name:'Save preferences',exact:true}).click();await page.getByRole('dialog',{name:'Discovery filters'}).waitFor({state:'hidden'});if(!writes.filter(w=>w.p==='/api/settings').at(-1).body.discovery.verifiedOnly)throw Error('Verified filter not saved');await page.waitForTimeout(100);if(!profileQueries.some(q=>new URLSearchParams(q).get('verified')==='1'))throw Error('Verified toggle not applied to the actual discovery request');
  });
  await check('Settings keeps one Help entry and surfaces verification withdrawal',async()=>{
   await page.goto(base+'/app/settings',{waitUntil:'networkidle'});if(await page.getByRole('link',{name:'Help & Support',exact:true}).count()!==1)throw Error('Settings help duplicated/missing');await page.getByRole('link',{name:'Verification data & withdrawal',exact:true}).waitFor();await capture('settings');
   await page.goto(base+'/app/settings/about',{waitUntil:'networkidle'});if(await page.getByRole('link',{name:'Help & Support',exact:true}).count())throw Error('Help inside About');await capture('about');
   for(const path of ['/app/privacy','/app/settings/safety']){await page.goto(base+path,{waitUntil:'networkidle'});if(await page.getByRole('link',{name:/blocked accounts/i}).count())throw Error('Blocked-account button remains '+path);await capture(path.endsWith('safety')?'safety':'privacy');}
   await page.goto(base+'/app/settings/verification',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Withdraw consent',exact:true}).waitFor();await page.getByRole('button',{name:'Withdraw consent',exact:true}).click();await page.getByRole('dialog',{name:'Withdraw verification consent',exact:true}).waitFor();await capture('withdrawal-confirmation');await page.getByRole('button',{name:'Keep verification',exact:true}).click();if(writes.some(w=>w.p==='/api/verification/consent'))throw Error('Withdrawal without confirmation');
  });
  await check('Every settings sub-screen has new reference chrome and stays within screen width',async()=>{
   for(const [label,path]of Object.entries({account:'/app/settings/account',notifications:'/app/settings/notifications',preferences:'/app/preferences',audience:'/app/settings/privacy',device:'/app/settings/device',support:'/app/settings/support',appeal:'/app/settings/appeal',terms:'/app/settings/legal/terms',policy:'/app/settings/legal/privacy'})){
    await page.goto(base+path,{waitUntil:'networkidle'});await page.locator('.phone').waitFor();if(await page.locator('.fb-legacy').count())throw Error('Legacy '+path);if(await page.locator('.fb-content').evaluate(e=>e.scrollWidth>e.clientWidth+1))throw Error('Overflow '+path);await capture('settings-'+label);
   }
  });
  await check('Deep link never paints the message list or legacy empty-chat controls during delayed history',async()=>{
   chatDelay=1200;await page.addInitScript(()=>{window.__chatPaints=[];const observer=new MutationObserver(()=>{const content=document.querySelector('.fb-content');if(content)window.__chatPaints.push({list:!!content.querySelector('.fb-messages'),oldEmpty:content.textContent.includes('Try an opener')});});observer.observe(document,{childList:true,subtree:true});});await page.goto(base+'/app/chat?match='+match,{waitUntil:'domcontentloaded'});await page.locator('.reference-chat-head').waitFor();await capture('chat-loading');await page.locator('.reference-thread-empty').waitFor();chatDelay=0;const frames=await page.evaluate(()=>window.__chatPaints);if(frames.some(f=>f.list||f.oldEmpty))throw Error('Intermediate wrong UI '+JSON.stringify(frames));await capture('chat-empty');
  });
  for(const kind of ['voice','video'])await check('New '+kind+' call UI preserves session, microphone and end controls',async()=>{
   await page.getByLabel('Conversation options',{exact:true}).click();await page.getByRole('button',{name:(kind==='voice'?'Voice':'Video')+' call Maya',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Freeborn '+kind+' call with Maya',exact:true});await dialog.waitFor();await page.getByRole('button',{name:'Mute microphone',exact:true}).click();await page.getByRole('button',{name:'Unmute microphone',exact:true}).waitFor();if(kind==='video'){await page.getByRole('button',{name:'Turn camera off',exact:true}).click();await page.getByRole('button',{name:'Turn camera on',exact:true}).waitFor();}await capture(kind+'-call');await page.getByRole('button',{name:'End call',exact:true}).click();await dialog.waitFor({state:'hidden'});if(!writes.some(w=>w.p==='/api/calls/session'&&w.auth&&w.body.kind===kind))throw Error('Missing authorized session');
  });
  await check('Incoming call uses the same new surface and preserves decline action',async()=>{incomingCall={id:mediaId,matchId:match,kind:'video',status:'ringing',peer:{id:peer,name:'Maya',photo:'/__fixture/woman.jpg'},calleeId:id};await page.goto(base+'/app/chat',{waitUntil:'networkidle'});await page.getByRole('dialog',{name:'Incoming Freeborn call',exact:true}).waitFor();await capture('incoming-video-call');await page.getByRole('button',{name:'Decline call',exact:true}).click();incomingCall=null;await page.getByRole('dialog',{name:'Incoming Freeborn call',exact:true}).waitFor({state:'hidden'});});
  await check('GPS consent uses viewer city and device time; denial leaves generic headline',async()=>{
   await ctx.grantPermissions(['geolocation']);await ctx.setGeolocation({latitude:5.55,longitude:5.79,accuracy:30});await page.clock.install({time:new Date(2026,10,21,9,0)});await page.goto(base+'/app',{waitUntil:'networkidle'});await page.getByRole('button',{name:/Refresh my location|Find people in my area/}).click();await page.getByText('Morning in Warri',{exact:true}).waitFor();await capture('discovery-gps-morning');await page.clock.setSystemTime(new Date(2026,10,21,20,0));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByText('Tonight in Warri',{exact:true}).waitFor();await capture('discovery-gps-night');await ctx.clearPermissions();await page.getByText('Date like you mean it',{exact:true}).waitFor();await page.clock.resume();
  });
  await ctx.close();
 }
 await browser.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));const failures=results.checks.filter(c=>!c.ok);console.log(JSON.stringify({checks:results.checks.length,failed:failures.length,captures:results.captures.length,pageErrors:results.errors.length}));if(failures.length||results.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
