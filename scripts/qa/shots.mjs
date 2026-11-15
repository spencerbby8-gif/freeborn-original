import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/home/user/freeborn-audit/evidence/screenshots";
mkdirSync(OUT, { recursive: true });
const BASE = "https://freeborndating.com";

const targets = [
  { name: "auth-signin-desktop", url: `${BASE}/auth`, vw: 1440, vh: 900, mobile: false },
  { name: "auth-signin-mobile", url: `${BASE}/auth`, vw: 390, vh: 844, mobile: true },
  { name: "auth-signup-mobile", url: `${BASE}/auth?mode=sign-up`, vw: 390, vh: 844, mobile: true },
  { name: "landing-mobile", url: `${BASE}/`, vw: 390, vh: 844, mobile: true },
];

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
} catch (e) {
  console.error("LAUNCH_FAILED:", String(e.message).split("\n").slice(0, 8).join(" | "));
  process.exit(2);
}

for (const t of targets) {
  const ctx = await browser.newContext({ viewport: { width: t.vw, height: t.vh }, isMobile: t.mobile, hasTouch: t.mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0, 140)));
  try {
    await page.goto(t.url, { waitUntil: "networkidle", timeout: 45000 });
  } catch {
    try { await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: 30000 }); } catch {}
  }
  await page.waitForTimeout(2500);
  const title = await page.title().catch(() => "");
  const h = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0);
  await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true }).catch(() => {});
  await page.screenshot({ path: `${OUT}/${t.name}-viewport.png`, fullPage: false }).catch(() => {});
  console.log(JSON.stringify({ name: t.name, title, scrollHeight: h, viewport: `${t.vw}x${t.vh}`, consoleErrors: errs.slice(0, 4) }));
  await ctx.close();
}
await browser.close();
console.log("SHOTS_DONE -> " + OUT);
