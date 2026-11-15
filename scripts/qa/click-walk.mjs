/**
 * click-walk.mjs — operate Freeborn like the owner: real taps on the tab bar,
 * cards and buttons; screenshot after every step. Owner-authorised QA session.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborn-rarrkz3fe-spencerbby8-5225s-projects.vercel.app";
const REF = process.env.SUPABASE_REF || "paskturljojjopxhnrik";
const OUT = "/home/user/freeborn-audit/evidence/screenshots/walk";
mkdirSync(OUT, { recursive: true });
const [EMAIL, PASSWORD] = readFileSync("/home/user/freeborn-audit/.secrets/preview-qa-account", "utf8").trim().split("\n");
const ANON = readFileSync("/home/user/freeborn-audit/.secrets/preview-anon-key", "utf8").trim();

const g = await fetch(`https://${REF}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const ses = await g.json();
const raw = JSON.stringify(ses);
const cookieName = `sb-${REF}-auth-token`;

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: cookieName, value: "base64-" + Buffer.from(raw).toString("base64url"), domain: new URL(BASE).hostname, path: "/", secure: true, sameSite: "Lax" }]);
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" && !/vercel.live|CSP|feedback/.test(m.text())) errs.push(m.text().slice(0, 120)); });
let navs = 0;
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs++; });

const seed = await ctx.newPage();
await seed.goto(BASE + "/auth?mode=sign-in", { waitUntil: "domcontentloaded" });
await seed.evaluate(([k, v]) => { localStorage.setItem(k, v); }, [cookieName, raw]);
await seed.close();

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const tap = async (sel, label) => {
  const l = page.locator(sel).first();
  await l.tap({ timeout: 8000 }).catch(async () => l.click({ timeout: 8000 }));
  console.log("tapped:", label);
  await page.waitForTimeout(3500);
};

await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
console.log("on /app:", page.url().replace(BASE, ""), "| navs so far:", navs);
await shot("01-deck");

// Tap the top card to open the full profile view (single tap, not double).
await tap('main [class*="card"], main article, main > div > div >> nth=0', "deck card");
await shot("02-card-tapped");
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(1200);

await tap('nav.fixed a[href="/app/profile"]', "Profile tab");
console.log("after profile tap:", page.url().replace(BASE, ""));
await shot("03-profile-top");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(900);
await shot("04-profile-mid");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(900);
await shot("05-profile-bottom");

// Settings entry (from profile or nav)
const settingsLink = page.locator('a[href="/app/settings"], button:has-text("Settings")').first();
if (await settingsLink.count()) {
  await settingsLink.tap().catch(() => settingsLink.click());
  await page.waitForTimeout(3500);
  console.log("after settings tap:", page.url().replace(BASE, ""));
  await shot("06-settings-top");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await shot("07-settings-bottom");
} else console.log("NO settings entry found from profile");

await tap('nav.fixed a[href="/app/chat"]', "Chat tab");
console.log("after chat tap:", page.url().replace(BASE, ""));
await shot("08-chat-list");
const thread = page.locator('a[href*="/app/chat/"], [class*="thread"] >> nth=0').first();
if (await thread.count()) {
  await thread.tap().catch(() => thread.click());
  await page.waitForTimeout(3500);
  await shot("09-chat-thread");
  console.log("thread url:", page.url().replace(BASE, ""));
} else console.log("no chat thread visible");

await tap('nav.fixed a[href="/app/likes"]', "Likes tab");
await shot("10-likes");
await tap('nav.fixed a[href="/app/notifications"]', "Alerts tab");
await shot("11-notifications");

console.log("TOTAL NAVS:", navs, "| console errors:", errs.length ? errs.slice(0, 5) : "none");
await browser.close();
