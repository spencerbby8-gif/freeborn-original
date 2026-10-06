import { chromium } from "playwright";

const BASE = "https://3000-i3ix0g06unxh422g5ed2h.e2b.app";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext();
const page = await context.newPage();

console.log("=== TOP-LEVEL TAB MODE ===");
await page.goto(`${BASE}/api/debug/setcookie`, { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(1000);
console.log("Set-Cookie response doc.cookie:", await page.evaluate(() => document.cookie));
await page.goto(`${BASE}/api/debug/auth`, { waitUntil: "load" });
const back = await page.textContent("body");
console.log("cookies sent back:", back.slice(0, 400));

console.log("\n=== IFRAME MODE (cross-site embed) ===");
const p2 = await context.newPage();
await p2.setContent(
  `<iframe id="f" src="${BASE}/api/debug/setcookie" style="width:700px;height:300px"></iframe>`,
  { waitUntil: "load" }
);
await p2.waitForTimeout(2500);
const frame = p2.frameLocator("#f");
// navigate the iframe to the auth debug endpoint and read what came back
await p2.evaluate((BASE) => {
  document.getElementById("f").src = `${BASE}/api/debug/auth`;
}, BASE);
await p2.waitForTimeout(3000);
const txt = await frame.locator("body").textContent();
console.log("iframe cookies sent back:", txt.slice(0, 400));

await browser.close();
console.log("\nDONE");
