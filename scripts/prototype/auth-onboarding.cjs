// Browser interaction regression only: intercepted fixture auth/APIs, not hosted signup acceptance.
const {chromium}=require('playwright');
const {hasFixtureOrigin}=require('./fixture-preflight.cjs');
const fs=require('node:fs/promises');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3003';
const output=process.env.FREEBORN_UI_OUTPUT||'scripts/prototype/.shots/auth-onboarding';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local server only');
const id='f5166a7e-1480-40a5-a770-146fb8cfd007',peer='f5166a7e-1480-40a5-a770-146fb8cfd008';
const user={id,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
function session(){return {access_token:Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture',refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user};}
const deck={id:peer,name:'Aria',age:27,city:'Brooklyn',occupation:'Designer',headline:'A curious mind and a kind heart.',traits:['Hiking'],photo:'/images/prototype/welcome.jpg',photos:['/images/prototype/welcome.jpg'],verified:true,presence:'today',distanceKm:10,isNew:true};
const draft={display_name:'Taylor',birth_date:'1998-01-02',gender:'woman',city:'Brooklyn',region:'New York',relationship_goals:['long_term'],values:['Health autonomy'],bio:'I love long walks, thoughtful conversations and good coffee.',interests:['Hiking','Coffee','Reading'],lifestyle_preferences:['Natural living'],photos:[]};
(async()=>{
 const html=await (await fetch(base+'/auth')).text();
 const paths=[...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/_next/')))];
 const sources=await Promise.all(paths.map(async p=>(await fetch(base+p)).text()));
 if(!hasFixtureOrigin(sources))throw Error('Build an isolated fixture app; never run fake sessions against real auth.');
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results={scope:'Local browser with intercepted fixture auth/APIs. No hosted signup, inbox, RLS or physical-device claim.',checks:[],captures:[],errors:[]};
 for(const viewport of [{width:393,height:852},{width:1440,height:1000}]){
  const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});
  await ctx.addInitScript(s=>{localStorage.setItem('sb-fixture-auth-token',JSON.stringify(s));sessionStorage.setItem('fb-security-checked',String(Date.now()));},session());
  let profileStatus=200,deckMode='members',step='welcome',stepDraft=structuredClone(draft),verifyInvalid=true;
  const writes=[];
  await ctx.routeWebSocket('wss://fixture.supabase.co/**',ws=>{ws.onMessage(()=>{});});
  await ctx.route('https://fixture.supabase.co/**',async r=>{
   const req=r.request(),p=new URL(req.url()).pathname;let data=user,status=200;
   if(req.method()==='POST'){if(p.endsWith('/signup'))data={user,session:null};else if(p.endsWith('/verify')){if(verifyInvalid){status=403;data={msg:'Token has expired or is invalid',error_code:'otp_expired'};}else data={...session(),user};}else data={};}
   await r.fulfill({status,json:data,headers:{'access-control-allow-origin':'*'}});
  });
  await ctx.route(base+'/api/**',async r=>{
   const req=r.request(),p=new URL(req.url()).pathname;let data={ok:true},status=200;
   if(req.method()==='POST'){let body={};try{body=req.postDataJSON()}catch{}writes.push({p,body,auth:!!req.headers().authorization});if(p==='/api/onboarding')Object.assign(stepDraft,body.patch);}
   else if(p==='/api/onboarding/state')data={completed:false,initialStep:step,draft:stepDraft};
   else if(p==='/api/settings')data={profile:{relationshipGoals:['long_term'],interests:[],displayName:'Taylor'},discovery:{relationshipIntents:['long_term'],ageMin:21,ageMax:40,distanceKm:80,showGenders:[],photosRequired:true},privacy:{},notifications:{},account:{}};
   else if(p==='/api/profiles'){status=profileStatus;data=status===200?{profiles:deckMode==='empty'?[]:[{...deck,id:peer}]}:{error:status===401?'Not signed in.':'We couldn’t load profiles right now. Please try again.'};}
   else if(p==='/api/profile/me')data={profile:{id,displayName:'Taylor',age:28,city:'Brooklyn',bio:draft.bio,photos:[],interests:[],values:[],relationshipGoals:[]}};
   else if(p.startsWith('/api/profile/')){status=profileStatus;data=status===200?{profile:{id,name:'Taylor',city:'Brooklyn',bio:draft.bio,photos:[],interests:[],values:[],relationshipGoals:[],lifestyle:[],drinking:'',language:''}}:{error:'Not signed in.'};}
   else if(p==='/api/verification')data={verified:true,status:'approved'};
   else if(p==='/api/chat/matches')data={matches:[]};
   else if(p==='/api/chat/requests')data={incoming:[],outgoing:[]};
   else if(p==='/api/notifications')data={notifications:[]};
   else if(p==='/api/likes')data={liked:[],likedYou:[]};
   await r.fulfill({status,json:data});
  });
  const page=await ctx.newPage();page.setDefaultTimeout(9000);page.on('pageerror',e=>results.errors.push(e.message));
  const dir=`${output}/${viewport.width}x${viewport.height}`;await fs.mkdir(dir,{recursive:true});
  const check=async(name,fn)=>{try{await fn();results.checks.push({viewport,name,ok:true});console.log('PASS',viewport.width,name);}catch(e){results.checks.push({viewport,name,ok:false,error:e.message});console.error('FAIL',viewport.width,name,e.message);}};
  const capture=async name=>{await page.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});results.captures.push({viewport,name});};
  await check('Every selectable is an explicit option control, including all About fields',async()=>{
   step='bio';await page.goto(base+'/onboarding',{waitUntil:'networkidle'});
   if(await page.locator('datalist').count())throw Error('Keyboard datalist remains');
   for(const [name,min,value] of [['Occupation',60,'Electrician'],['Education',10,"Master's degree"],['Language',50,'Nigerian Pidgin'],['Faith & beliefs',25,'African traditional religion']]){
    const field=page.getByLabel(name,{exact:true});if(await field.locator('option').count()<min)throw Error(name+' lacks options');await field.selectOption({label:value});
   }
   await page.getByLabel('Occupation',{exact:true}).selectOption('__custom__');await page.getByLabel('Occupation — your own answer',{exact:true}).fill('Marine engineer');
   const n=writes.length;await page.getByRole('button',{name:'Continue',exact:true}).click();await page.locator('[data-onboarding-step="6"]').waitFor();
   const patch=writes.slice(n).find(w=>w.p==='/api/onboarding')?.body.patch;if(patch?.occupation!=='Marine engineer'||patch.religion!=='African traditional religion'||patch.language!=='Nigerian Pidgin')throw Error('Selections not saved');await capture('explicit-options-saved');
  });
  await check('Every forward step resets the real scrollport to the top and focuses its heading',async()=>{
   step='welcome';stepDraft=structuredClone(draft);await page.goto(base+'/onboarding',{waitUntil:'networkidle'});
   for(let i=1;i<7;i++){
    await page.locator(`[data-onboarding-step="${i}"]`).waitFor();
    const submit=page.locator('.fb-step-shell button[type=submit]');await submit.scrollIntoViewIfNeeded();await submit.click();await page.locator(`[data-onboarding-step="${i+1}"]`).waitFor();
    const state=await page.locator('.fb-step-shell').evaluate(el=>({top:el.closest('.fb-content').scrollTop,focus:document.activeElement===el.querySelector('h1'),overflow:el.scrollWidth>el.clientWidth+1}));
    if(state.top>1||!state.focus||state.overflow)throw Error('Step '+(i+1)+' '+JSON.stringify(state));
   }await capture('step-seven-top');
   await page.getByRole('button',{name:'Back',exact:true}).click();await page.locator('[data-onboarding-step="6"]').waitFor();if(await page.locator('.fb-content').evaluate(e=>e.scrollTop)>1)throw Error('Back retained scroll');
  });
  await check('401 and 503 discovery errors never claim an exhausted deck; retry recovers',async()=>{
   for(const code of [401,503]){profileStatus=code;await page.goto(base+'/app',{waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:code===401?'Not signed in.':'couldn’t load profiles'}).waitFor();if(await page.getByText('You’ve met everyone for now.',{exact:true}).count()||await page.getByRole('button',{name:'Reset deck',exact:true}).count())throw Error('Failure presented as empty deck');await capture('deck-error-'+code);}
   profileStatus=200;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.deck .profile-card').waitFor();await capture('deck-recovered');
  });
  await check('A genuine successful empty response still displays the honest empty deck',async()=>{
   deckMode='empty';await page.goto(base+'/app',{waitUntil:'networkidle'});await page.getByText('You’ve met everyone for now.',{exact:true}).waitFor();await capture('genuine-empty-deck');deckMode='members';
  });
  await check('Own-profile eye sends bearer authentication and displays the current profile',async()=>{
   profileStatus=200;let detailAuth=false;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/profile/'+id)detailAuth=!!r.headers().authorization;});await page.goto(base+'/app/profile',{waitUntil:'networkidle'});await page.getByRole('button',{name:'View profile',exact:true}).click();await page.locator('.fb-detail-overlay .pd-name').filter({hasText:'Taylor'}).waitFor();if(!detailAuth)throw Error('Profile preview omitted bearer');await capture('own-profile-preview');
  });
  await check('Email-code Continue spans its form and is centered; invalid then valid OTP works',async()=>{
   await page.evaluate(()=>localStorage.clear());await page.goto(base+'/auth?mode=sign-up',{waitUntil:'networkidle'});await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.locator('input[name=password]').fill('Fixture-Password-2026!');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('region',{name:'Verify your email'}).waitFor();
   const d=await page.locator('.email-code-form').evaluate(form=>{const a=form.getBoundingClientRect(),b=form.querySelector('button[type=submit]').getBoundingClientRect();return{width:Math.abs(a.width-b.width),center:Math.abs(a.x+a.width/2-b.x-b.width/2)}});if(d.width>1||d.center>1)throw Error(JSON.stringify(d));await capture('email-code-full-width');
   await page.getByLabel('Email confirmation code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Confirm and continue',exact:true}).click();await page.locator('#email-code-error p').waitFor();verifyInvalid=false;step='welcome';await page.getByRole('button',{name:'Confirm and continue',exact:true}).click();await page.waitForURL(base+'/onboarding');
  });
  await ctx.close();
 }
 await browser.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/results.json`,JSON.stringify(results,null,2));const failures=results.checks.filter(c=>!c.ok);console.log(JSON.stringify({checks:results.checks.length,failed:failures.length,captures:results.captures.length,pageErrors:results.errors.length}));if(failures.length||results.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
