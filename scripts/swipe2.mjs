import { chromium } from "playwright";
const BASE = "https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const browser = await chromium.launch({ args:["--no-sandbox"] });
const ctx = await browser.newContext({ viewport:{width:420,height:900} });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const out=[]; const ok=(n,p,d="")=>out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);
await page.goto(`${BASE}/discover`, { waitUntil:"domcontentloaded", timeout:30000 });
await page.waitForSelector("article", { timeout:20000 });
await page.waitForTimeout(1000);
const name = async () => (await page.locator("article h2").first().textContent().catch(()=>"")).trim();
const swipe = async () => {
  const box = await page.locator("article").first().boundingBox().catch(()=>null);
  if(!box) return;
  await page.mouse.move(box.x+box.width*0.5, box.y+box.height*0.28);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*0.5-190, box.y+box.height*0.28, {steps:10});
  await page.mouse.up();
  await page.waitForTimeout(850);
};
const first = await name();
await swipe();
const second = await name();
ok("swipe left on photo area skips card", first!==second && second!=="", `${first} -> ${second}`);
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
