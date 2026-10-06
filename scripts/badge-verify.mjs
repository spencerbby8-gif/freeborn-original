import { chromium } from "playwright";
import fs from "node:fs";
const BASE="https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const token=fs.readFileSync("/tmp/vttok.txt","utf8").trim();
const vid=fs.readFileSync("/tmp/vtid.txt","utf8").trim();
const session=JSON.stringify({access_token:token,token_type:"bearer",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,refresh_token:"e2e",user:{id:vid,aud:"authenticated",role:"authenticated",email:"verify-test@freeborn.app",app_metadata:{},user_metadata:{},created_at:"2026-10-05T21:00:00Z",updated_at:"2026-10-05T21:00:00Z"}});
const browser=await chromium.launch({args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:420,height:900}});
await ctx.addInitScript(([k,v])=>localStorage.setItem(k,v),["sb-ihwtpwlszegrjgakqsxx-auth-token",session]);
const page=await ctx.newPage(); page.setDefaultTimeout(9000);
await page.goto(`${BASE}/app`,{waitUntil:"domcontentloaded",timeout:30000});
await page.waitForSelector("article",{timeout:20000}); await page.waitForTimeout(1000);
const out=[]; const ok=(n,p,d="")=>out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);
const name=async()=>(await page.locator("article h2").first().textContent().catch(()=>"")).trim();
const swipe=async()=>{const b=await page.locator("article").first().boundingBox().catch(()=>null); if(!b)return; await page.mouse.move(b.x+b.width*0.5,b.y+b.height*0.28); await page.mouse.down(); await page.mouse.move(b.x+b.width*0.5-200,b.y+b.height*0.28,{steps:10}); await page.mouse.up(); await page.waitForTimeout(900);};
// swipe through up to 5 cards, record unvax badge presence
let seen=[];
for(let i=0;i<5;i++){
  const nm=await name(); if(!nm)break;
  const badge=await page.locator("article [aria-label='Identifies as unvaccinated']").count().catch(()=>0);
  seen.push(`${nm}${badge>0?"[UNVAX-BADGE]":""}`);
  await swipe();
}
ok("swipe cycles through profiles", seen.length>=2, seen.join(" -> "));
ok("unvaccinated badge shown on unvaccinated profiles", seen.some(s=>s.includes("[UNVAX-BADGE]")), seen.filter(s=>s.includes("[UNVAX-BADGE]")).join(","));
console.log(out.join("\n"));
await browser.close(); process.exit(0);
