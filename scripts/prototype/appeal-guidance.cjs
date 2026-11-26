// LOCAL ONLY: fake auth and intercepted appeal API. No real member, email, or hosted acceptance.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {hasFixtureOrigin}=require('./fixture-preflight.cjs');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Loopback only');
const id='f5166a7e-1480-40a5-a770-146fb8cfd007';
const user={id,email:'fixture@example.test',aud:'authenticated',role:'authenticated'};
const jwt=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session={access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
(async()=>{
 const html=await(await fetch(base+'/auth')).text();const paths=[...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/_next/')))];if(!hasFixtureOrigin(await Promise.all(paths.map(async p=>(await fetch(base+p)).text()))))throw Error('Requires isolated fixture build');
 const out='/home/user/freeborn-audit/appeal-guidance-browser';await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
 try{
  for(const width of [320,1440]){
   const ctx=await browser.newContext({viewport:{width,height:852},reducedMotion:'reduce'});let reads=0,answer={appeal:null},outage=false;
   await ctx.addInitScript(()=>localStorage.setItem('fb-notif-asked','1'));
   await ctx.route('https://fixture.supabase.co/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:[],headers:{'access-control-allow-origin':'*'}}));
   await ctx.route(base+'/api/appeals',r=>{reads++;return r.fulfill(outage?{status:503,json:{error:'synthetic outage'}}:{json:answer})});
   const page=await ctx.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base+'/appeal',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Accessing an appeal'}).waitFor();assert.equal(new URL(page.url()).pathname,'/appeal');assert.equal(reads,0);
    assert.equal(await page.getByRole('link',{name:'support@freeborndating.com'}).getAttribute('href'),'mailto:support@freeborndating.com');await page.getByText('This page cannot confirm email delivery or a response.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Check session again'}).click();await page.getByRole('heading',{name:'Accessing an appeal'}).waitFor();assert.equal(reads,0);await page.screenshot({path:`${out}/signed-out-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log(`PASS ${width}px signed-out appeal stays visible with honest support fallback and no API request`);
    await page.evaluate(s=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(s)),session);outage=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('alert').filter({hasText:'Could not load your appeal'}).waitFor();assert.equal(new URL(page.url()).pathname,'/appeal');await page.getByRole('link',{name:'support@freeborndating.com'}).waitFor();outage=false;await page.getByRole('button',{name:'Try again'}).click();await page.getByLabel('Your appeal').waitFor();console.log(`PASS ${width}px simulated service failure shows retry without claiming a suspension or success`);
    answer={appeal:{status:'under_review',verdict:null,dueAt:new Date().toISOString(),ready:false}};await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Your appeal is under investigation'}).waitFor();assert.equal(await page.getByText('Never from an opinion',{exact:false}).count(),0);
    answer={appeal:{status:'decided',verdict:'cleared',dueAt:new Date().toISOString(),ready:true}};await page.reload({waitUntil:'domcontentloaded'});await page.getByText('The recorded appeal decision is cleared. Account access may require a separate update.').waitFor();assert.equal(await page.getByText('Your account has been cleared. Welcome back.').count(),0);
    answer={appeal:{status:'decided',verdict:'opaque fixture reason',dueAt:new Date().toISOString(),ready:true}};await page.reload({waitUntil:'domcontentloaded'});await page.getByText('An appeal decision has been recorded. Contact support if you need more details.').waitFor();assert.equal(await page.getByText('The suspension stands after investigation.').count(),0);assert.equal(await page.getByText('opaque fixture reason').count(),0);console.log(`PASS ${width}px synthetic pending and decision states do not assert unverified causes or access`);
   }finally{await ctx.close();}
  }
  assert.deepEqual(errors,[]);console.log('LIMIT synthetic intercepted auth/API only; no email sent or hosted suspended-account flow tested');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
