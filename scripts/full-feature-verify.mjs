import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const token = fs.readFileSync("/tmp/vttok.txt","utf8").trim();
const vid = fs.readFileSync("/tmp/vtid.txt","utf8").trim();
const session = JSON.stringify({ access_token: token, token_type:"bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in:3600, refresh_token:"e2e", user:{ id: vid, aud:"authenticated", role:"authenticated", email:"verify-test@freeborn.app", app_metadata:{}, user_metadata:{}, created_at:"2026-10-05T21:00:00Z", updated_at:"2026-10-05T21:00:00Z" }});
const browser = await chromium.launch({ args:["--no-sandbox"] });
const out = [];
const ok = (n,p,d="")=>out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);

/* 1) Card swipe + lightbox + unvax badge on standalone /discover */
{
  const ctx = await browser.newContext({ viewport:{width:420,height:900} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/discover`, { waitUntil:"domcontentloaded", timeout:40000 });
  await page.waitForSelector("article", { timeout:25000 });
  await page.waitForTimeout(1000);
  const unvax = await page.locator("article [aria-label='Identifies as unvaccinated']").count();
  ok("unvaccinated badge on discovery card", unvax>=1, `count=${unvax}`);
  const before = await page.locator("article h2").first().textContent();
  const box = await page.locator("article").first().boundingBox();
  await page.mouse.move(box.x+box.width*0.5, box.y+box.height*0.6);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*0.5-160, box.y+box.height*0.6, {steps:8});
  await page.mouse.up();
  await page.waitForTimeout(900);
  const after = await page.locator("article h2").first().textContent().catch(()=>before);
  ok("swipe left skips card", before!==after, `${before} -> ${after}`);
  // lightbox
  const box2 = await page.locator("article").first().boundingBox();
  await page.mouse.click(box2.x+box2.width*0.5, box2.y+box2.height*0.4);
  await page.waitForTimeout(900);
  const lb = await page.getByLabel("Close photo viewer").count();
  ok("tap photo opens lightbox", lb>=1, `count=${lb}`);
  if (lb) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
  await ctx.close();
}

/* 2) Onboarding unvaccinated question (bio step) */
{
  const ctx = await browser.newContext({ viewport:{width:420,height:900} });
  await ctx.addInitScript(([k,v])=>localStorage.setItem(k,v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/onboarding`, { waitUntil:"domcontentloaded", timeout:40000 });
  await page.waitForSelector("text=Vaccination stance", { timeout:25000 }).catch(()=>{});
  const vaxQ = await page.getByText("Vaccination stance").count();
  const unvaxOpt = await page.getByText("Unvaccinated", { exact:true }).count();
  const privateOpt = await page.getByText("Prefer not to say").count();
  ok("onboarding has Vaccination stance question", vaxQ>=1, `count=${vaxQ}`);
  ok("onboarding offers Unvaccinated option", unvaxOpt>=1 && privateOpt>=1, `unvax=${unvaxOpt} private=${privateOpt}`);
  await ctx.close();
}

/* 3) Chat media buttons */
{
  const ctx = await browser.newContext({ viewport:{width:420,height:900} });
  await ctx.addInitScript(([k,v])=>localStorage.setItem(k,v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
  const page = await ctx.newPage();
  // create a match via API (like Mara)
  await fetch(`${BASE}/api/likes`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`}, body: JSON.stringify({ profileId:"11111111-0000-4000-8000-000000000001", choice:"like" }) });
  await page.goto(`${BASE}/app/chat`, { waitUntil:"domcontentloaded", timeout:40000 });
  await page.waitForTimeout(2500);
  const matchRow = page.locator("[role='button']").first();
  if (await matchRow.count()) { await matchRow.click(); await page.waitForTimeout(1500); }
  const img = await page.getByLabel("Send a photo").count();
  const vid = await page.getByLabel("Send a video").count();
  const voice = await page.getByLabel(/Record a voice note|Stop recording/).count();
  ok("chat image/video/voice buttons", img>=1&&vid>=1&&voice>=1, `img=${img} vid=${vid} voice=${voice}`);
  await ctx.close();
}

console.log(out.join("\n"));
await browser.close();
