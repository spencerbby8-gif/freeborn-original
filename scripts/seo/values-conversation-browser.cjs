const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path='/guides/relationship-values-questions';
const origin='http://127.0.0.1:3002';
const output=process.env.VALUES_EVIDENCE_DIR||'/home/user/freeborn-audit/organic-growth-research/validation';
(async()=>{fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];const errors=[];
async function check(name,fn){await fn();results.push(name);console.log('ok '+results.length+' - '+name)}
for(const [name,viewport] of [['mobile',{width:393,height:852}],['desktop',{width:1365,height:900}]]){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+path);await page.getByRole('checkbox').first().waitFor();
 await check(name+' title/canonical',async()=>{assert.match(await page.title(),/Relationship values questions/);assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://freeborndating.com'+path)});
 await check(name+' one h1 and 12 accessible checkboxes',async()=>{assert.equal(await page.locator('h1').count(),1);assert.equal(await page.getByRole('checkbox').count(),12)});
 await check(name+' empty copy disabled',async()=>assert.ok(await page.getByRole('button',{name:'Copy questions'}).isDisabled()));
 await check(name+' select five / others disabled / unselect works',async()=>{for(let i=0;i<5;i++)await page.getByRole('checkbox').nth(i).check();assert.equal(await page.locator('input:disabled').count(),7);assert.equal(await page.locator('[aria-label="Your conversation questions"] li').count(),5);await page.getByRole('checkbox').first().uncheck();assert.equal(await page.locator('input:disabled').count(),0);await page.getByRole('checkbox').last().check()});
 await check(name+' explicit clipboard action creates plain questions only',async()=>{await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text}}})});await page.getByRole('button',{name:'Copy questions'}).click();assert.match(await page.evaluate(()=>window.__copied),/An invitation, not a test/);assert.match(await page.getByRole('status').textContent(),/Nothing has been sent/)});
 await check(name+' primary action has a visible contrasting background',async()=>{const colors=await page.getByRole('button',{name:'Copy questions'}).evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));assert.equal(colors.background,'rgb(217, 167, 82)');assert.equal(colors.color,'rgb(10, 13, 24)')});
 await page.evaluate(source=>{const script=document.createElement('script');script.nonce=document.querySelector('script[nonce]')?.nonce||'';script.textContent=source;document.head.appendChild(script)},fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
 await check(name+' automated accessibility scan has no violations',async()=>{const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])});
 await check(name+' clipboard failure is handled',async()=>{await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked')}}}));await page.getByRole('button',{name:'Copy questions'}).click();assert.match(await page.getByRole('status').textContent(),/select and copy/)});
 await check(name+' no selection persistence in storage / URL',async()=>{assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/values|conversation/i.test(k)).length),0);assert.equal(page.url(),origin+path);await page.reload();assert.equal(await page.locator('input:checked').count(),0)});
 await check(name+' keyboard checkbox toggles',async()=>{await page.getByRole('checkbox').first().focus();await page.keyboard.press('Space');assert.ok(await page.getByRole('checkbox').first().isChecked())});
 await check(name+' clear resets tool',async()=>{await page.getByRole('button',{name:'Clear selection'}).click();assert.equal(await page.locator('input:checked').count(),0);assert.equal(await page.locator('[aria-label="Your conversation questions"]').count(),0)});
 await check(name+' no horizontal overflow',async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)));
 await page.getByRole('checkbox').first().check();await page.screenshot({path:output+'/values-'+name+'.png',fullPage:true,timeout:20000});await context.close();
}
const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto(origin+path);
await check('no-JavaScript full editorial questions remain readable',async()=>{assert.equal(await page.locator('dl dt').count(),12);assert.ok((await page.locator('dl').textContent()).includes('Communication'));assert.equal(await page.locator('h1').count(),1)});
await check('no browser page errors',async()=>assert.deepEqual(errors,[]));
await context.close();await browser.close();fs.writeFileSync(output+'/values-browser.json',JSON.stringify({checks:results.length,results,pageErrors:errors,scope:'Local production build; clipboard success/failure mocked, not OS clipboard certification.'},null,2));console.log('PASS '+results.length+' browser checks');})().catch(e=>{console.error(e);process.exit(1)});
