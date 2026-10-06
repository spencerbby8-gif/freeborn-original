import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const token = fs.readFileSync("/tmp/vttok.txt","utf8").trim();
const vid = fs.readFileSync("/tmp/vtid.txt","utf8").trim();
const session = JSON.stringify({ access_token: token, token_type:"bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in:3600, refresh_token:"e2e", user:{ id: vid, aud:"authenticated", role:"authenticated", email:"verify-test@freeborn.app", app_metadata:{}, user_metadata:{}, created_at:"2026-10-05T21:00:00Z", updated_at:"2026-10-05T21:00:00Z" }});
const browser = await chromium.launch({ args:["--no-sandbox"] });
const ctx = await browser.newContext({ viewport:{width:420,height:900} });
await ctx.addInitScript(([k,v])=>localStorage.setItem(k,v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
const page = await ctx.newPage();
page.setDefaultTimeout(9000);
const out=[]; const ok=(n,p,d="")=>out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);
await page.goto(`${BASE}/app`, { waitUntil:"domcontentloaded", timeout:30000 });
await page.waitForSelector("article", { timeout:20000 });
await page.waitForTimeout(1200);
const name = async () => (await page.locator("article h2").first().textContent().catch(()=>"")).trim();
const swipe = async () => {
  const box = await page.locator("article").first().boundingBox().catch(()=>null);
  if(!box) return;
  await page.mouse.move(box.x+box.width*0.5, box.y+box.height*0.28);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*0.5-200, box.y+box.height*0.28, {steps:10});
  await page.mouse.up();
  await page.waitForTimeout(900);
};
const first = await name();
await swipe();
const second = await name();
ok("signed-in swipe left skips card", first!==second && second!=="", `${first} -> ${second}`);
// find unvaccinated card
let unvaxOn="";
for(let i=0;i<5;i++){
  const b = await page.locator("article [aria-label='Identifies as unvaccinated']").count().catch(()=>0);
  const nm = await name();
  if(b>0){ unvaxOn=nm; break; }
  if(!nm) break;
  await swipe();
}
ok("unvaccinated badge on unvaccinated profile", unvaxOn!=="", `found on: ${unvaxOn||"none"}`);
console.log(out.join("\n"));
await browser.close();
process.exit(0);
