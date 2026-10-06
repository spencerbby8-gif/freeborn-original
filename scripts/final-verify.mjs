import { chromium } from "playwright";
const BASE = "https://3000-ixb2zvxuhd5nos32g83n2.e2b.app";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
const page = await ctx.newPage();
const out = [];
const ok = (n, p, d="") => out.push(`${p?"PASS":"FAIL"} | ${n}${d?" | "+d:""}`);

await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForSelector("article", { timeout: 25000 });
await page.waitForTimeout(1000);

// unvax badge on card (Mara is unvaccinated)
const unvaxBadge = await page.locator("article [aria-label='Identifies as unvaccinated']").count();
ok("unvaccinated badge on card", unvaxBadge >= 1, `count=${unvaxBadge}`);

// card swipe left = skip
const before = await page.locator("article h2").first().textContent();
const box = await page.locator("article").first().boundingBox();
await page.mouse.move(box.x + box.width*0.5, box.y + box.height*0.6);
await page.mouse.down();
await page.mouse.move(box.x + box.width*0.5 - 150, box.y + box.height*0.6, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(800);
const after = await page.locator("article h2").first().textContent().catch(()=>before);
ok("swipe left skips to next card", before !== after, `${before} -> ${after}`);

// photo lightbox: tap photo
await page.mouse.click(box.x + box.width*0.5, box.y + box.height*0.4);
await page.waitForTimeout(800);
const lightbox = await page.getByLabel("Close photo viewer").count();
ok("tap photo opens lightbox", lightbox >= 1, `count=${lightbox}`);
if (lightbox) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }

// chat media buttons (need a match; go to chat)
await page.goto(`${BASE}/app/chat`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
// open first match if exists
const matchBtn = page.locator("[role='button']").first();
if (await matchBtn.count()) { await matchBtn.click(); await page.waitForTimeout(1200); }
const imgBtn = await page.getByLabel("Send a photo").count();
const vidBtn = await page.getByLabel("Send a video").count();
const voiceBtn = await page.getByLabel(/Record a voice note|Stop recording/).count();
ok("chat has image+video+voice buttons", imgBtn>=1 && vidBtn>=1 && voiceBtn>=1, `img=${imgBtn} vid=${vidBtn} voice=${voiceBtn}`);

console.log(out.join("\n"));
await browser.close();
