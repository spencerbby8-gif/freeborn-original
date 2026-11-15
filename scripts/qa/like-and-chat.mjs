/**
 * like-and-chat.mjs — like a member from the deck through the real UI, then
 * open the resulting conversation (if mutual) and capture the chat screen and
 * its composer (image/video sending UI). Owner-authorised QA session.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborn-rarrkz3fe-spencerbby8-5225s-projects.vercel.app";
const REF = "paskturljojjopxhnrik";
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
page.on("console", (m) => { if (m.type() === "error" && !/vercel.live|feedback/.test(m.text())) console.log("CONSOLE ERR:", m.text().slice(0, 120)); });
const likes = [];
page.on("response", (r) => { if (/\/api\/likes/.test(r.url())) likes.push(r.status()); });

const seed = await ctx.newPage();
await seed.goto(BASE + "/auth?mode=sign-in", { waitUntil: "domcontentloaded" });
await seed.evaluate(([k, v]) => { localStorage.setItem(k, v); }, [cookieName, raw]);
await seed.close();

await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// Open the first card with a single tap, then use the Like action button.
const card = page.locator("main article, main [draggable], main > div > div").first();
await card.tap().catch(() => card.click());
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/12-card-open.png` });

const likeBtn = page.locator('button:has-text("Like"), button[aria-label*="ike"]').first();
if (await likeBtn.count()) {
  await likeBtn.tap().catch(() => likeBtn.click());
  console.log("tapped Like");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/13-after-like.png` });
} else {
  console.log("no Like button visible in overlay; listing buttons:");
  const btns = await page.locator("button").allInnerTexts();
  console.log(btns.filter(Boolean).slice(0, 20).join(" | "));
}
console.log("likes api statuses:", likes);

// Chat tab: look for a thread now.
await page.locator('nav.fixed a[href="/app/chat"]').first().tap().catch(async () => page.locator('nav.fixed a[href="/app/chat"]').first().click());
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/14-chat-after-like.png` });
const thread = page.locator('main a[href*="/chat/"], main button:has-text("Open"), main [class*="cursor-pointer"]').first();
if (await thread.count()) {
  await thread.tap().catch(() => thread.click());
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/15-chat-thread.png` });
  console.log("thread url:", page.url().replace(BASE, ""));
  // composer controls
  const inputs = await page.locator("input, textarea, button[aria-label]").evaluateAll((els) =>
    els.map((e) => (e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.tagName)).slice(0, 15));
  console.log("composer controls:", inputs.join(" | "));
  await page.screenshot({ path: `${OUT}/16-chat-composer.png` });
} else {
  console.log("still no thread (like not mutual — expected for sample members)");
}
await browser.close();
