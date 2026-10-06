import { chromium } from "playwright";

const BASE = "https://3000-ilgtypoy8m81apncr3q40.e2b.app";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const gen = await ctx.newPage();

// Generate a REAL large photo (gradient screenshot, 1600x1000)
await gen.setContent(`<body style="margin:0;height:100vh;background:linear-gradient(135deg,#ef5e5e,#d9a752 40%,#4fb8a7 75%,#0a0d18)"></body>`);
await gen.screenshot({ path: "/tmp/big-photo.png" });

const page = await ctx.newPage();
await page.goto(`${BASE}/dev/step-test?step=photos`, { waitUntil: "networkidle" });
await page.locator('input[type="file"]').setInputFiles("/tmp/big-photo.png");
await page.waitForTimeout(3500);

const tiles = await page.locator('img[alt^="Profile photo"]').count();
console.log(tiles >= 1 ? "PASS | large photo processed into preview" : "FAIL | large photo not processed");

await page.locator('button[type="submit"]').click();
await page.waitForTimeout(800);
const payload = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
const src = payload.photos?.[0]?.src || "";
const approxKB = Math.round((src.length * 3) / 4 / 1024);
console.log(
  src.startsWith("data:image/jpeg") && approxKB < 250
    ? `PASS | 1600x1000 photo compressed to ~${approxKB}KB JPEG (payload-safe)`
    : `FAIL | unexpected payload: len=${src.length}`
);
console.log(
  payload.photos?.[0]?.isCover === true ? "PASS | cover flag set automatically" : "FAIL | cover flag missing"
);

await browser.close();
