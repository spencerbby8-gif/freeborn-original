import { chromium } from "playwright";
const BASE = "https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const browser = await chromium.launch({ args:["--no-sandbox"] });
const ctx = await browser.newContext({ viewport:{width:420,height:900} });
const page = await ctx.newPage();
const out = [];
const ok=(n,p,d="")=>out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);
await page.goto(`${BASE}/discover`, { waitUntil:"domcontentloaded", timeout:40000 });
await page.waitForSelector("article", { timeout:25000 });
await page.waitForTimeout(1200);

// swipe on the PHOTO area (top ~30%) — should advance the card
const swipe = async () => {
  const box = await page.locator("article").first().boundingBox();
  await page.mouse.move(box.x+box.width*0.5, box.y+box.height*0.30);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*0.5-180, box.y+box.height*0.30, {steps:10});
  await page.mouse.up();
  await page.waitForTimeout(900);
};
let before = await page.locator("article h2").first().textContent();
await swipe();
let after = await page.locator("article h2").first().textContent().catch(()=>before);
ok("swipe left on photo skips card", before!==after, `${before} -> ${after}`);

// keep swiping to find an unvaccinated card and check badge
let foundUnvax = false; let name="";
for (let i=0;i<5;i++){
  const badge = await page.locator("article [aria-label='Identifies as unvaccinated']").count();
  name = await page.locator("article h2").first().textContent().catch(()=>"");
  if (badge>0){ foundUnvax=true; break; }
  await swipe();
}
ok("unvaccinated badge appears on unvaccinated profile", foundUnvax, `found on: ${name}`);
console.log(out.join("\n"));
await browser.close();
