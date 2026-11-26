// LOCAL ONLY: intercepted synthetic Supabase/Auth and APIs; not hosted acceptance or email delivery proof.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {hasFixtureOrigin}=require('./fixture-preflight.cjs');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3000';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('loopback only');
const id='f5166a7e-1480-40a5-a770-146fb8cfd007',other='f5166a7e-1480-40a5-a770-146fb8cfd008';
const user={id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
const session=()=>({access_token:Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user});
const out='/home/user/freeborn-audit/auth-banner-browser';
(async()=>{
 const html=await(await fetch(base+'/auth')).text();const paths=[...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/_next/')))];
 if(!hasFixtureOrigin(await Promise.all(paths.map(async p=>(await fetch(base+p)).text()))))throw Error('Requires isolated fixture build');
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
 async function fixture({width=393,completed=true,signup='confirmation',failLogin=false,denyEntryStorage=false,preauth=false}={}){
  const ctx=await browser.newContext({viewport:{width,height:852},reducedMotion:'reduce'});
  await ctx.addInitScript(({s,preauth,denyEntryStorage})=>{
   localStorage.setItem('fb-notif-asked','1');sessionStorage.setItem('fb-security-checked',String(Date.now()));if(preauth)localStorage.setItem('sb-fixture-auth-token',JSON.stringify(s));
   if(denyEntryStorage){const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===sessionStorage&&k==='freeborn.auth-entry.v1')throw new DOMException('Synthetic denied storage','SecurityError');return original.call(this,k,v)}}
  },{s:session(),preauth,denyEntryStorage});
  await ctx.routeWebSocket('wss://fixture.supabase.co/**',ws=>ws.onMessage(()=>{}));
  await ctx.route('https://api.pwnedpasswords.com/**',r=>r.fulfill({status:503,body:'fixture unavailable'}));
  await ctx.route('https://fixture.supabase.co/**',r=>{
   const req=r.request(),p=new URL(req.url()).pathname;let data={},status=200;
   if(p.endsWith('/token')){if(failLogin){status=400;data={msg:'Invalid login credentials',error:'invalid_grant'};}else data=session();}
   else if(p.endsWith('/signup'))data=signup==='signed'?{...session(),user:{...user,identities:[{id:'fixture',provider:'email',user_id:id}]}}:{user:{...user,identities:[{id:'fixture',provider:'email',user_id:id}]},session:null};
   else if(p.endsWith('/verify'))data=session();else if(p.endsWith('/user'))data=user;
   return r.fulfill({status,json:data,headers:{'access-control-allow-origin':'*'}});
  });
  await ctx.route(base+'/api/**',r=>{const p=new URL(r.request().url()).pathname;let data={ok:true};if(p==='/api/onboarding/state')data={completed,initialStep:'welcome',draft:{}};else if(p==='/api/settings')data={profile:{displayName:'QA Member',interests:[],relationshipGoals:[]},discovery:{relationshipIntents:[],ageMin:21,ageMax:40,distanceKm:80,showGenders:[],photosRequired:true},privacy:{},notifications:{},account:{}};else if(p==='/api/profiles')data={profiles:[]};else if(p==='/api/chat/matches')data={matches:[]};else if(p==='/api/chat/requests')data={incoming:[],outgoing:[]};else if(p==='/api/notifications')data={memberId:id,notifications:[]};else if(p==='/api/likes')data={liked:[],likedYou:[]};else if(p==='/api/verification')data={verified:true,status:'approved'};else if(p==='/api/profile/me')data={profile:{id,displayName:'QA Member',photos:[],interests:[],values:[],relationshipGoals:[]}};return r.fulfill({json:data})});
  const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.stack)});return {ctx,page};
 }
 async function login(page){await page.goto(base+'/auth?mode=sign-in',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.locator('input[name=password]').fill('Fixture-Password-2026!');await page.getByRole('button',{name:'Continue',exact:true}).click();}
 async function signup(page){await page.goto(base+'/auth?mode=sign-up',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.locator('input[name=password]').fill('Fixture-Password-2026!');await page.getByRole('button',{name:'Continue',exact:true}).click();}
 async function assertEntry(page,text){await page.waitForLoadState('domcontentloaded');const banner=page.getByRole('alert').filter({hasText:text});await banner.waitFor();assert.equal(await banner.count(),1);const box=await banner.boundingBox();if(!box)console.error('No banner bounds',page.url(),(await page.locator('body').innerText()).slice(0,500),'errors:',errors);assert.ok(box&&box.y>=0&&box.y<80&&box.x>=0&&box.x+box.width<=await page.evaluate(()=>innerWidth)+1,JSON.stringify(box));return banner;}
 try{
  for(const width of [320,393,1440]){
   const {ctx,page}=await fixture({width});try{await login(page);await page.waitForURL(base+'/app');const banner=await assertEntry(page,'Welcome back to Freeborn.');await page.screenshot({path:`${out}/sign-in-${width}.png`});await banner.getByRole('button',{name:'Dismiss notification'}).click();assert.equal(await banner.count(),0);await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('alert').filter({hasText:'Welcome back to Freeborn.'}).count(),0);console.log(`PASS ${width}px sign-in banner survives navigation, dismisses, and never replays`);}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({completed:false,signup:'signed'});try{await signup(page);await page.waitForURL(base+'/onboarding');await assertEntry(page,'You’re signed in.');await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('alert').filter({hasText:'You’re signed in.'}).count(),0);console.log('PASS signup session welcome survives navigation to onboarding exactly once');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({completed:false,signup:'confirmation'});try{await signup(page);await page.getByRole('region',{name:'Verify your email'}).waitFor();assert.match(await page.getByRole('region',{name:'Verify your email'}).innerText(),/If eligible/);await page.getByLabel('Email confirmation code').fill('123456');await page.getByRole('button',{name:'Confirm and continue'}).click();await page.waitForURL(base+'/onboarding');await assertEntry(page,'Email confirmed');await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('alert').filter({hasText:'Email confirmed'}).count(),0);console.log('PASS confirmed-code banner appears once after onboarding navigation');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({completed:false,signup:'confirmation'});try{await page.clock.install();await signup(page);await page.getByRole('region',{name:'Verify your email'}).waitFor();await page.clock.fastForward('01:01');await page.getByRole('button',{name:'Resend code',exact:true}).click();await page.getByRole('alert').filter({hasText:'If a code was sent'}).waitFor();assert.equal(new URL(page.url()).pathname,'/auth');console.log('PASS resend response uses conditional wording without claiming delivery');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture();try{await page.goto(base+'/auth?mode=reset-password',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.getByRole('button',{name:'Send reset link'}).click();const notice=page.getByRole('alert').filter({hasText:'If the address is eligible'});await notice.waitFor();assert.equal(new URL(page.url()).pathname,'/auth');assert.equal(await page.evaluate(()=>sessionStorage.getItem('freeborn.auth-entry.v1')),null);console.log('PASS recovery request uses conditional inbox wording and does not claim delivery');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({preauth:true});try{await page.goto(base+'/auth?mode=update-password',{waitUntil:'domcontentloaded'});await page.getByLabel('New password',{exact:true}).fill('Fixture-Password-2026!');await page.getByRole('button',{name:'Update password'}).click();await page.waitForURL(base+'/app');await assertEntry(page,'Your password has been updated.');await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.getByRole('alert').filter({hasText:'Password updated'}).count(),0);console.log('PASS password update success persists once without claiming complete account security');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture();try{for(const [status,copy] of [['verified','If you have confirmed your email'],['recovered','If you opened a recovery link'],['password-updated','If you changed your password'],['signed-out','If you signed out'],['suspended','If your account is suspended']]){await page.goto(base+'/auth?mode=sign-in&status='+status,{waitUntil:'domcontentloaded'});await page.locator('section.screen').getByText(copy,{exact:false}).waitFor();}console.log('PASS URL-provided auth statuses use conditional wording rather than assert an unverified result');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({failLogin:true});try{await login(page);await page.getByRole('alert').filter({hasText:"We couldn't finish that"}).waitFor();assert.equal(new URL(page.url()).pathname,'/auth');assert.equal(await page.evaluate(()=>sessionStorage.getItem('freeborn.auth-entry.v1')),null);console.log('PASS rejected sign-in shows error and queues no success');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({denyEntryStorage:true});try{await login(page);await page.waitForURL(base+'/app');console.log('PASS unavailable session storage never prevents successful navigation');}finally{await ctx.close();}
  }
  {
   const {ctx,page}=await fixture({preauth:true});try{
    await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
    for(const [label,entry] of [['different account',{kind:'signedIn',memberId:other,target:'/app',createdAt:Date.now()}],['expired',{kind:'signedIn',memberId:id,target:'/app',createdAt:Date.now()-180000}],['future',{kind:'signedIn',memberId:id,target:'/app',createdAt:Date.now()+60000}],['unknown kind',{kind:'invented',memberId:id,target:'/app',createdAt:Date.now()}],['bad target',{kind:'signedIn',memberId:id,target:'https://example.test',createdAt:Date.now()}]]){
     await page.evaluate(e=>sessionStorage.setItem('freeborn.auth-entry.v1',JSON.stringify(e)),entry);await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(400);assert.equal(await page.getByRole('alert').filter({hasText:'Welcome back to Freeborn.'}).count(),0,label);assert.equal(await page.evaluate(()=>sessionStorage.getItem('freeborn.auth-entry.v1')),null,label);
    }
    console.log('PASS different-account, stale, future and unknown handoffs are not displayed');
   }finally{await ctx.close();}
  }
  assert.deepEqual(errors,[]);console.log('LIMIT synthetic fixture auth and intercepted APIs; no real emails, provider delivery, hosted login, OAuth or physical-device proof');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
