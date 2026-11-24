const {chromium}=require('playwright');
const {build}=require('esbuild');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:3002';
const out=process.env.EDITORIAL_EVIDENCE_DIR||'/home/user/freeborn-audit/builds-3-9/validation';
const fingerprint=()=>execFileSync('python',['scripts/growth/fingerprint.py'],{encoding:'utf8'}).trim();
(async()=>{
 fs.mkdirSync(out,{recursive:true});fs.rmSync(out+'/editorial-browser-results.json',{force:true});const initial=fingerprint();const built=await build({entryPoints:['src/lib/dating-guides.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const {datingGuides:guides,GUIDE_REVIEW_DATE:date}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 const results=[],failures=[],errors=[],mutations=[];const check=async(name,fn)=>{try{await fn();results.push(name);console.log('ok '+results.length+' - '+name)}catch(e){failures.push(name+': '+e.message);throw e}};
 const browser=await chromium.launch({headless:true});
 try{
  await check('seven distinct edited guides with real ISO date',async()=>{assert.equal(guides.length,7);assert.equal(new Set(guides.map(g=>g.slug)).size,7);assert.match(date,/^\d{4}-\d{2}-\d{2}$/)});
  for(const g of guides){await check(g.slug+' content and internal IDs are coherent',async()=>{assert.ok(g.sections.length>=4);assert.ok(g.faqs.length>=2);assert.ok(g.related.length>=3);assert.equal(new Set(g.sections.map(s=>s.id)).size,g.sections.length);assert.ok(g.intro.length>100);for(const s of g.sections)assert.ok((s.paragraphs?.length||0)+(s.items?.length||0)+(s.example?1:0)>0)})}
  for(const [name,viewport]of [['narrow',{width:320,height:740}],['mobile',{width:393,height:852}],['desktop',{width:1365,height:900}]]){
   const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))mutations.push({method:r.method(),path:new URL(r.url()).pathname})});
   for(const g of [...guides.map(g=>({...g,path:'/guides/'+g.slug})),{slug:'alternatives',path:'/alternatives',title:null,sections:[]}]){
    const response=await page.goto(origin+g.path);await page.locator('h1').waitFor();
    await check(name+' '+g.slug+' public metadata and exactly one main/title',async()=>{assert.equal(response.status(),200);assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://freeborndating.com'+g.path);assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),'https://freeborndating.com'+g.path);assert.doesNotMatch(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/);if(g.title)assert.equal(await page.locator('h1').textContent(),g.title)});
    await check(name+' '+g.slug+' complete article and no sensitive collector',async()=>{assert.ok((await page.locator('article').textContent()).split(/\s+/).length>=300);assert.equal(await page.locator('input,textarea,form,iframe').count(),0);assert.equal(await page.locator('a[href^="/app"],a[href^="/api/"],a[href^="/discover"]').count(),0)});
    await check(name+' '+g.slug+' FAQ schema exactly matches visible questions and answers',async()=>{const all=(await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(t=>{const v=JSON.parse(t);return Array.isArray(v)?v:[v]});const faq=all.find(v=>v['@type']==='FAQPage');const items=page.locator('[data-guide-faq]');assert.equal(await items.count(),faq.mainEntity.length);for(let i=0;i<faq.mainEntity.length;i++){assert.equal(await items.nth(i).locator('summary').textContent(),faq.mainEntity[i].name);assert.equal(await items.nth(i).locator('p').textContent(),faq.mainEntity[i].acceptedAnswer.text)}assert.equal(all.filter(v=>v['@type']==='WebPage').length,1);assert.equal(all.filter(v=>v['@type']==='BreadcrumbList').length,1);assert.ok(!all.some(v=>v['@type']==='AggregateRating'))});
    await check(name+' '+g.slug+' every table-of-contents target exists once',async()=>{for(const el of await page.locator('a[href^="#"]').all()){const href=await el.getAttribute('href');assert.equal(await page.locator(href).count(),1)}});
    await check(name+' '+g.slug+' native FAQ keyboard works',async()=>{const first=page.locator('[data-guide-faq]').first();await first.locator('summary').focus();await page.keyboard.press('Enter');assert.ok(await first.locator('p').isVisible());await page.keyboard.press('Enter');assert.equal(await first.getAttribute('open'),null)});
    await page.locator('details').evaluateAll(items=>items.forEach(d=>d.open=true));
    await check(name+' '+g.slug+' no horizontal document overflow',async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)));
    await page.evaluate(source=>{const script=document.createElement('script');script.nonce=document.querySelector('script[nonce]')?.nonce||'';script.textContent=source;document.head.appendChild(script)},fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
    await check(name+' '+g.slug+' expanded WCAG scan',async()=>{const r=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[])});
    if(name==='mobile'||(name==='desktop'&&g.slug==='alternatives')){await page.locator('details').evaluateAll(items=>items.forEach(d=>d.open=false));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+g.slug+'-'+name+'.png',fullPage:true,timeout:20000})}
    await check(name+' '+g.slug+' signup link opens real signup without submitting',async()=>{await page.getByRole('link',{name:'Create a profile',exact:true}).click();await page.waitForURL('**/auth?mode=sign-up');assert.match(await page.locator('meta[name=robots]').getAttribute('content'),/noindex/)});
   }
   await page.goto(origin+'/guides');
   await check(name+' hub has all seven guides, tool, free page and repaired comparison',async()=>{for(const p of [...guides.map(g=>'/guides/'+g.slug),'/free-dating','/alternatives','/guides/relationship-values-questions'])assert.equal(await page.locator(`main a[href="${p}"]`).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))});
   if(name==='desktop'){await page.screenshot({path:out+'/guides-desktop.png',fullPage:true,timeout:20000})}
   await context.close();
  }
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:393,height:852}});const page=await nojs.newPage();
  for(const p of [...guides.map(g=>'/guides/'+g.slug),'/alternatives']){await page.goto(origin+p);await check('no-JS '+p+' text and native FAQ remain usable',async()=>{const first=page.locator('[data-guide-faq]').first();await first.locator('summary').click();assert.ok(await first.locator('p').isVisible());assert.ok((await page.locator('article').textContent()).length>1500)})}
  await nojs.close();
  const request=await browser.newContext();const client=request.request;const site=fs.readFileSync('src/lib/site.ts','utf8');const block=/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/.exec(site)[1];const paths=[...block.matchAll(/path: "([^"]+)"/g)].map(m=>m[1]);const pages=[];
  const allEditorialLinks=new Set();
  for(const p of paths){const r=await client.get(origin+p);assert.equal(r.status(),200,p);const body=await r.text();const internal=[...new Set([...body.matchAll(/href="(\/[^"#]*)"/g)].map(m=>m[1].replace(/&amp;/g,'&')).filter(v=>!v.startsWith('/_next/')))];if(p.startsWith('/guides')||p==='/alternatives')for(const link of internal)allEditorialLinks.add(link);const links=internal.filter(v=>paths.includes(v));pages.push({path:p,status:r.status(),links})}
  await check('every internal guide/comparison link resolves and avoids member/API routes',async()=>{for(const p of allEditorialLinks){assert.ok(!/^\/(api|app|discover)(\/|$)/.test(p));const r=await client.get(origin+p);assert.ok(r.status()>=200&&r.status()<400,p+': '+r.status())}});
  await check('all allowlisted public pages render; all new guides and comparison reachable from home',async()=>{const graph=new Map(pages.map(p=>[p.path,p.links]));const visited=new Set(['/']);const queue=['/'];while(queue.length)for(const next of graph.get(queue.shift())||[])if(!visited.has(next)){visited.add(next);queue.push(next)}for(const p of paths)assert.ok(visited.has(p),'Orphan editorial path '+p)});
  await check('sitemap lists every editorial path once and no private URLs',async()=>{const text=await(await client.get(origin+'/sitemap.xml')).text();for(const p of paths){const url='https://freeborndating.com'+(p==='/'?'':p);const locations=[...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/\/$/,''));assert.equal(locations.filter(v=>v===url).length,1)}assert.doesNotMatch(text,/<loc>[^<]*\/(auth|app|api|discover|onboarding)(\/|<)/)});
  await check('comparison no longer carries stale ratings or lifetime-price claim',async()=>{const text=await(await client.get(origin+'/alternatives')).text();assert.doesNotMatch(text,/2\.4 average|220 ratings|no paywall waiting to be switched|no billing code exists|holds 2\.4 stars/);assert.ok([...text.matchAll(/href="([^"]+)"/g)].some(([,href])=>href==='https://www.unjected.com/'));assert.ok(text.includes('115004647686-Tinder-Overview'))});
  await check('auth remains noindexed and member profile API refuses anonymous read',async()=>{assert.match(await(await client.get(origin+'/auth')).text(),/noindex/);assert.equal((await client.get(origin+'/api/profiles')).status(),401)});
  await check('no data-changing requests from editorial interactions',async()=>assert.deepEqual(mutations,[]));
  await check('zero browser page errors',async()=>assert.deepEqual(errors,[]));
  await check('evidence still bound to unchanged source',async()=>assert.equal(fingerprint(),initial));await request.close();
  fs.writeFileSync(out+'/editorial-browser-results.json',JSON.stringify({ok:true,checks:results.length,failures,sourceFingerprint:initial,results,pageErrors:errors,mutationRequests:mutations,publicPages:pages,scope:'Local production build, Chromium emulation and axe; no real account creation, physical-device/provider certification or production release.'},null,2)+'\n');console.log('PASS '+results.length+' editorial checks');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
