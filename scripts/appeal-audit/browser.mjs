// Local fixture build, synthetic browser session, real local appeal/challenge handlers and disposable PostgreSQL.
// External networking is disabled; this does not test hosted Auth, suspended login, or provider mail.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const {hasFixtureOrigin}=createRequire(import.meta.url)('../prototype/fixture-preflight.cjs');
const base='http://127.0.0.1:3000',out='/home/user/freeborn-audit/appeal-challenge-browser';
const width=Number(process.env.FREEBORN_APPEAL_WIDTH??320);if(![320,1440].includes(width))throw Error('Unsupported fixture viewport');
const html=await(await fetch(base+'/auth')).text();const paths=[...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/_next/')))];if(!hasFixtureOrigin(await Promise.all(paths.map(async p=>(await fetch(base+p)).text()))))throw Error('Requires isolated fixture build');
await fs.mkdir(out,{recursive:true});process.env.FREEBORN_HUMAN_CHALLENGE='enforce';
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External networking disabled in local test')};
const h=await createHarness({routes:{appeals:'src/app/api/appeals/route.ts',issue:'src/app/api/human/issue/route.ts',verify:'src/app/api/human/verify/route.ts'}});await h.seed();const email=h.identities[IDS.a].email,q=(s,p=[])=>h.client.query(s,p);
const user={id:IDS.a,email,aud:'authenticated',role:'authenticated'};
const jwt=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:IDS.a,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session={access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width,height:852},reducedMotion:'reduce'});const statuses=[],errors=[];
try{
 await q('delete from public.appeals where email=$1',[email]);await q('delete from public.suspensions where email=$1',[email]);await q('delete from public.human_challenges where email=$1',[email]);await q("insert into suspensions(email,reason,active) values($1,'fixture',true)",[email]);await q("insert into appeals(email,detail,status,verdict,created_at) values($1,'Synthetic historical appeal','decided','fixture',now()-interval '1 day')",[email]);
 await ctx.addInitScript(s=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify(s)),session);
 await ctx.route('https://fixture.supabase.co/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.endsWith('/user')?user:[],headers:{'access-control-allow-origin':'*'}}));
 await ctx.route(base+'/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname,key=p==='/api/appeals'?'appeals':p==='/api/human/issue'?'issue':p==='/api/human/verify'?'verify':null;if(!key)return route.fulfill({status:404,json:{error:'fixture route unavailable'}});const headers=new Headers(req.headers());headers.set('authorization','Bearer '+IDS.a);headers.delete('host');headers.delete('content-length');const response=await h.routes[key][req.method()](new Request(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer()}));statuses.push({path:p,method:req.method(),status:response.status});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})});
 const page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/appeal',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Start another appeal'}).click();await page.getByLabel('Your appeal').fill('A synthetic appeal for local challenge testing.');await page.getByRole('button',{name:'Submit appeal'}).click();await page.getByRole('heading',{name:'Your appeal is under review'}).waitFor();await page.screenshot({path:out+`/under-review-${width}.png`});
 assert.ok(statuses.some(x=>x.path==='/api/appeals'&&x.method==='POST'&&x.status===428));assert.ok(statuses.some(x=>x.path==='/api/human/issue'&&x.status===200));assert.ok(statuses.some(x=>x.path==='/api/human/verify'&&x.status===200));assert.ok(statuses.some(x=>x.path==='/api/appeals'&&x.method==='POST'&&x.status===200));
 assert.equal((await q("select count(*)::int n from appeals where email=$1 and status='under_review'",[email])).rows[0].n,1);assert.equal((await q("select count(*)::int n from human_challenges where email=$1 and purpose='appeal' and status='expired'",[email])).rows[0].n,1);assert.deepEqual(errors,[]);console.log(`PASS ${width}px browser solves actual local enforced challenge and files exactly one local appeal`);console.log('LIMIT Auth synthetic; no hosted suspended login or actual email');
}finally{await ctx.close();await browser.close();await q('delete from human_challenges where email=$1',[email]);await q('delete from appeals where email=$1',[email]);await q('delete from suspensions where email=$1',[email]);await q('delete from security_events where email=$1',[email]);await h.close();globalThis.fetch=oldFetch;delete process.env.FREEBORN_HUMAN_CHALLENGE;}
