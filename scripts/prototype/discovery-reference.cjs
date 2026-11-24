// Visual renderer check ONLY: synthetic member/auth/API responses, never member acceptance.
// Explicit opt-in is required for an HTTPS deployment. No fixture token reaches a backend.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3002';
const output=process.env.FREEBORN_UI_OUTPUT||'scripts/prototype/.shots/discovery-reference';
const origin=new URL(base);
if(origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw Error('Expected a plain origin');
const local=['localhost','127.0.0.1'].includes(origin.hostname);
if(!local&&(process.env.FREEBORN_DEPLOYED_VISUAL!=='1'||origin.protocol!=='https:'||!(origin.hostname==='freeborndating.com'||origin.hostname.endsWith('.vercel.app'))))throw Error('Explicit deployed-visual opt-in required for an approved HTTPS host');
const id='f5166a7e-1480-40a5-a770-146fb8cfd007',peer='f5166a7e-1480-40a5-a770-146fb8cfd008';
const user={id,email:'visual-fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const session={access_token:Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.visual-fixture',refresh_token:'visual-fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,user};
const aria={id:peer,name:'Aria',age:27,city:'Brooklyn',occupation:'Graphic Designer',headline:'Designing by day, chasing sunsets by night. I believe in deep talks, random adventures, and good coffee.',traits:[],photo:'/__visual/portrait.jpg',photos:['/__visual/portrait.jpg'],verified:true,presence:'today',heightCm:168,isNew:true,relationshipGoals:['long_term'],values:['Health autonomy'],lifestyle:['Natural health'],interests:['Hiking','Ambient music','Matcha lover']};
const settings={account:{email:user.email},profile:{displayName:'Visual fixture',city:'Enugu',interests:[],relationshipGoals:[],discoverable:true},discovery:{ageMin:18,ageMax:99,distanceKm:500,showGenders:[],relationshipIntents:[],verifiedOnly:false,photosRequired:true},privacy:{hideDistance:false,hideActiveStatus:false,readReceipts:true},notifications:{matchAlerts:true,messageAlerts:true,likeAlerts:true,profileActivity:false}};
(async()=>{
 await fs.mkdir(output,{recursive:true});
 const html=await(await fetch(base+'/auth?mode=sign-in')).text();
 const chunks=[...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/_next/')))];
 const sources=await Promise.all(chunks.map(async p=>(await fetch(base+p)).text()));
 const projects=[...new Set(sources.flatMap(s=>[...s.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/g)].map(m=>m[1])))];
 if(!projects.length)throw Error('No configured public provider found; cannot render synthetic session');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results={scope:'Rendered application assets from the specified origin, with fully intercepted synthetic auth and APIs. NOT a real signed-in hosted member flow. No backend mutations.',origin:base,checks:[],errors:[],screenshots:[]};
 try{
  for(const viewport of [{width:393,height:852},{width:360,height:740},{width:430,height:932},{width:1440,height:1000}]){
   const ctx=await browser.newContext({viewport,timezoneId:'Africa/Lagos',permissions:['geolocation'],geolocation:{latitude:6.45,longitude:7.5},reducedMotion:'reduce'});
   await ctx.addInitScript(({session,projects})=>{for(const project of projects)localStorage.setItem('sb-'+project+'-auth-token',JSON.stringify(session));sessionStorage.setItem('fb-security-checked',String(Date.now()));localStorage.setItem('fb-notif-asked','1');},{session,projects});
   let failDeck=false,failChoice=false,emptyDeck=false;const writes=[];
   await ctx.routeWebSocket(/.*/,ws=>ws.close());
   await ctx.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin.origin&&url.pathname==='/__visual/portrait.jpg')return route.fulfill({contentType:'image/jpeg',body:await fs.readFile(path.join(process.cwd(),'public/images/prototype/welcome.jpg'))});
    if(url.origin===origin.origin&&url.pathname.startsWith('/api/')){
     const p=url.pathname;if(req.method()!=='GET')writes.push({path:p,method:req.method()});
     let data={ok:true},status=200;
     if(p==='/api/settings')data=settings;
     if(p==='/api/profiles'){status=failDeck?500:200;data=failDeck?{error:'Discovery is temporarily unavailable. Please try again.'}:{profiles:emptyDeck?[]:[aria]};}
     if(p==='/api/likes'&&req.method()==='POST'&&failChoice){status=500;data={error:'Your choice could not be saved. Please try again.'};}
     if(p==='/api/notifications')data={notifications:[],memberId:id};
     if(p==='/api/chat/matches')data={matches:[]};
     if(p==='/api/chat/requests')data={incoming:[],outgoing:[]};
     if(p==='/api/calls/session')data={incoming:null};
     if(p==='/api/profile/me')data={profile:{id,displayName:'Visual fixture',photos:[],interests:[],relationshipGoals:[],isVerified:false}};
     return route.fulfill({status,json:data});
    }
    if(projects.some(p=>url.hostname===p+'.supabase.co'))return route.fulfill({json:url.pathname.includes('/auth/')?user:[],headers:{'access-control-allow-origin':'*'}});
    if(url.hostname==='api.bigdatacloud.net')return route.fulfill({json:{city:'Enugu'}});
    if(url.origin===origin.origin)return route.continue();
    return route.abort();
   });
   const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>results.errors.push(e.message));
   const check=async(name,fn)=>{try{await fn();results.checks.push({viewport,name,ok:true});console.log('PASS',viewport.width,name);}catch(e){results.checks.push({viewport,name,ok:false,error:e.message});console.error('FAIL',viewport.width,name,e.message);await page.screenshot({path:path.join(output,viewport.width+'-failure-'+results.checks.length+'.png')});}};
   const capture=async name=>{const filename=viewport.width+'-'+name+'.png';await page.screenshot({path:path.join(output,filename),animations:'disabled'});results.screenshots.push(filename);};
   await page.clock.install({time:new Date('2026-11-21T08:15:00Z')});
   await page.goto(base+'/app',{waitUntil:'networkidle'});await page.locator('.card-name').waitFor();
   await check('Viewer city and MORNING come from granted location and device timezone',async()=>{await page.getByText('Morning in Enugu',{exact:true}).waitFor();await capture('morning');});
   await check('Four existing tabs retain labels, order, routes and icons',async()=>{const tabs=await page.locator('.tabbar a').evaluateAll(es=>es.map(e=>({label:e.textContent.trim(),path:e.getAttribute('href'),icon:e.querySelector('svg').outerHTML})));assert.deepEqual(tabs.map(t=>[t.label,t.path]),[['Discover','/app'],['Likes','/app/likes'],['Messages','/app/chat'],['Profile','/app/profile']]);assert.equal(tabs.length,4);assert(tabs.every(t=>t.icon.includes('stroke-width="1.5"')));});
   await check('Reference card is layered, clipped and includes all three actions INSIDE its border',async()=>{const g=await page.evaluate(()=>{const el=document.querySelector('.profile-card'),r=el.getBoundingClientRect(),d=document.querySelector('.deck');return {card:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},overflow:getComputedStyle(el).overflow,layer:getComputedStyle(d,'::before').display,actions:[...el.querySelectorAll('.discover-actions button')].map(e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};})};});assert.equal(g.layer,'block');assert.equal(g.overflow,'hidden');assert.equal(g.actions.length,3);for(const b of g.actions){assert(b.top>=g.card.top&&b.bottom<=g.card.bottom+1);assert(b.left>=g.card.left&&b.right<=g.card.right);}assert.equal(await page.locator('.discovery-location-row').count(),0);});
   await check('All actions remain reachable above unchanged tabs without horizontal overflow',async()=>{await page.locator('.say-hello').scrollIntoViewIfNeeded();const g=await page.evaluate(()=>({bottom:document.querySelector('.discover-actions').getBoundingClientRect().bottom,tabs:document.querySelector('.tabbar').getBoundingClientRect().top,over:document.querySelector('.discover-scroll').scrollWidth-document.querySelector('.discover-scroll').clientWidth}));assert(g.bottom<=g.tabs+1,JSON.stringify(g));assert(g.over<=1);await page.locator('.discover-scroll').evaluate(e=>e.scrollTop=0);});
   for(const [hour,period]of [[14,'Afternoon'],[18,'Evening'],[23,'Tonight']])await check(period+' replaces morning on return to the app',async()=>{await page.clock.setSystemTime(new Date(`2026-11-21T${String(hour-1).padStart(2,'0')}:15:00Z`));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByText(period+' in Enugu',{exact:true}).waitFor();await capture(period.toLowerCase());});
   await check('Midnight/daybreak minute timer changes Tonight to Morning without a reload',async()=>{await page.clock.setSystemTime(new Date('2026-11-22T03:59:30Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.getByText('Tonight in Enugu',{exact:true}).waitFor();await page.clock.runFor(61000);await page.getByText('Morning in Enugu',{exact:true}).waitFor();});
   await check('Like write failures remain visible and do not discard the displayed member',async()=>{failChoice=true;await page.getByRole('button',{name:'Like Aria',exact:true}).click();await page.clock.runFor(200);await page.getByText('Your choice could not be saved. Please try again.',{exact:true}).waitFor();await page.locator('.card-name').filter({hasText:'Aria'}).waitFor();await capture('choice-error');failChoice=false;});
   await page.clock.resume();
   await check('Failed deck is an explicit retry state, never a fake empty deck or sample member',async()=>{failDeck=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:'Discovery is temporarily unavailable. Please try again.'}).waitFor();assert.equal(await page.locator('.profile-card,.deck-empty').count(),0);await capture('deck-error');failDeck=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.card-name').waitFor();});
   await check('A successful empty response is distinct from request failure',async()=>{emptyDeck=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'You’ve met everyone for now.'}).waitFor();assert.equal(await page.locator('.profile-card').count(),0);emptyDeck=false;});
   results.checks.push({viewport,name:'All API writes intercepted (no live mutations)',ok:true,writes});
   await ctx.close();
  }
 }finally{await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');}
 const failed=results.checks.filter(c=>!c.ok);console.log(JSON.stringify({checks:results.checks.length,failed:failed.length,pageErrors:results.errors.length,scope:results.scope}));if(failed.length||results.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
