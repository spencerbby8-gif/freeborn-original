// Chromium verification of actual generated local pages; not Bing rendering/indexing evidence.
// Never signs in. Block all external network and service workers.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const base=process.env.FREEBORN_UI_BASE_URL||'http://127.0.0.1:3003';
const output=process.env.FREEBORN_UI_OUTPUT;
if(!['http://127.0.0.1:3003','http://localhost:3003'].includes(base)||!output)throw Error('Explicit isolated loopback build and output directory required');
(async()=>{
 const src=await fs.readFile('src/lib/site.ts','utf8');const block=src.match(/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/)[1];
 const paths=[...block.matchAll(/path: "([^"]+)"/g)].map(m=>m[1]);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:393,height:852},serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];await fs.mkdir(output,{recursive:true});
 try{
  for(const pathname of paths){
   const response=await page.goto(base+pathname,{waitUntil:'networkidle'});assert.equal(response.status(),200);
   const m=await page.evaluate(()=>({title:document.title,descriptions:Array.from(document.querySelectorAll('meta[name="description"]'),m=>m.content),canonical:Array.from(document.querySelectorAll('link[rel="canonical"]'),m=>m.href),ogTitle:document.querySelector('meta[property="og:title"]')?.content,robots:document.querySelector('meta[name="robots"]')?.content,mainText:document.querySelector('main')?.textContent?.trim().length??0,jsonLd:Array.from(document.querySelectorAll('script[type="application/ld+json"]'),m=>JSON.parse(m.textContent)),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1}));
   assert.equal(m.descriptions.length,1);const length=Array.from(m.descriptions[0]).length;assert(length>=25&&length<=160);
   assert.deepEqual(m.canonical.map(u=>u.replace(/\/$/,'')),[('https://freeborndating.com'+pathname).replace(/\/$/,'')]);
   assert(!/noindex/.test(m.robots));assert(m.mainText>0);assert(m.jsonLd.length>0);assert(!/Â·|&amp;|\ufffd/.test(m.title));assert(!/Â·|&amp;|\ufffd/.test(m.ogTitle));assert(!m.horizontalOverflow);
   let screenshot=null;if(['/','/free-dating','/guides/shared-values-dating'].includes(pathname)){screenshot=(pathname==='/'?'home':pathname.slice(1).replaceAll('/','-'))+'.png';await page.screenshot({path:path.join(output,screenshot),animations:'disabled'});}
   results.push({path:pathname,status:response.status(),title:m.title,description:m.descriptions[0],descriptionCharacters:length,canonical:m.canonical,ogTitle:m.ogTitle,jsonLdBlocks:m.jsonLd.length,mobileHorizontalOverflow:m.horizontalOverflow,screenshot,ok:true});
   console.log('PASS public Chromium metadata '+pathname+' ('+length+' characters)');
  }
  assert.equal(errors.length,0,'Uncaught browser errors');
 }finally{
  await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify({scope:'Real local Chromium page loads with external network blocked, no login or member data. Not a Bing preview, hosted acceptance or indexing proof.',pages:results,uncaughtPageErrors:errors},null,2));
 }
 console.log('PASS '+results.length+' public page browser checks; '+errors.length+' uncaught page errors. Not Bing indexing evidence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
