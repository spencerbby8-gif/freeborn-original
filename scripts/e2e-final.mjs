import { chromium } from "playwright";
const BASE = "https://3000-iik52mlxqamly6lmn52ux.e2b.app";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ storageState: "/tmp/e2e-state.json", viewport: { width: 1280, height: 1400 } });
const page = await ctx.newPage();
await page.setContent(`<body style="margin:0;height:100vh;background:radial-gradient(circle at 30% 30%,#ef5e5e,#d9a752 45%,#171d36 90%)"></body>`);
await page.screenshot({ path: "/tmp/e2e-photo.png" });

await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForSelector("text=Your photo foundation.", { timeout: 30000 });
await page.locator('input[type="file"]').setInputFiles("/tmp/e2e-photo.png");
await page.waitForSelector('img[alt^="Profile photo"]', { timeout: 30000 });
console.log("PASS F1 | photo uploaded + previewed");
await page.getByRole("button", { name: /Finish & enter Freeborn/ }).click();
await page.waitForURL("**/discover", { timeout: 45000 });
console.log("PASS F2 | COMPLETED -> landed on /discover");
await browser.close();
