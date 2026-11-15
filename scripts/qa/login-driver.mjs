/**
 * login-driver.mjs — operate Freeborn like a human, behind the login.
 *
 * OWNER-AUTHORISED (2026-11-10): the owner explicitly authorised creating one
 * test account and passing the Cloudflare human check in this QA browser during
 * development. Nothing here weakens the shipped app: we interact with the real
 * Turnstile checkbox inside its real iframe, exactly as a person would.
 *
 * Usage:
 *   BASE=... MODE=sign-up|sign-in EMAIL=... PASSWORD=... \
 *   ROUTES='/' node scripts/qa/login-driver.mjs
 *
 * Behaviour:
 *   - fills the real form, clicks the real Turnstile checkbox (retry loop),
 *     submits, and CONFIRMS a session was established (localStorage token and/or
 *     post-auth redirect).
 *   - then walks ROUTES (comma separated) capturing, for each: final URL, page
 *     height, viewport-fit, a structural inventory (headings/sections/buttons),
 *     and a full-page screenshot. This is the "before" map for redesign work.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborndating.com";
const MODE = process.env.MODE || "sign-up";
const EMAIL = process.env.EMAIL || "";
const PASSWORD = process.env.PASSWORD || "";
const OUT = process.env.SHOT_DIR || "/home/user/freeborn-audit/evidence/screenshots/loggedin";
const ROUTES = (process.env.ROUTES || "").split(",").map((s) => s.trim()).filter(Boolean);
mkdirSync(OUT, { recursive: true });

if (!EMAIL || !PASSWORD) throw new Error("EMAIL and PASSWORD are required");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const net = [];
page.on("request", (r) => { if (/supabase\.co\/auth\/v1\//.test(r.url())) net.push(r.method() + " " + r.url().replace(/^https:\/\//, "").split("?")[0].slice(0, 60)); });

const toast = () => page.evaluate(() => {
  const t = document.querySelector('[role="alert"], .fb-toast-in');
  return t ? t.innerText.replace(/\s+/g, " ").trim().slice(0, 120) : null;
});

async function clickTurnstile() {
  // Try the real checkbox inside the real Cloudflare iframe, like a person would.
  const frames = page.frames().filter((f) => /challenges\.cloudflare\.com/.test(f.url()));
  for (const f of frames) {
    for (const sel of ['input[type="checkbox"]', ".ctp-checkbox-label", "#challenge-stage", "label", "body"]) {
      try {
        const loc = f.locator(sel).first();
        if (await loc.count()) { await loc.click({ timeout: 2500, force: true }); return `frame:${sel}`; }
      } catch { /* next selector */ }
    }
  }
  // Fallback: click the widget box itself.
  try { await page.locator(".cf-turnstile").click({ timeout: 2500, force: true }); return "host-box"; } catch { return "none"; }
}

console.log("BASE =", BASE, "| MODE =", MODE, "| EMAIL =", EMAIL);
await page.goto(`${BASE}/auth?mode=${MODE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);

let sessionOk = false;
let lastToast = null;
for (let attempt = 1; attempt <= 6 && !sessionOk; attempt++) {
  const how = await clickTurnstile();
  await page.waitForTimeout(3500);
  await page.click("button[type=submit]");
  await page.waitForTimeout(2500);
  lastToast = await toast();
  const url = page.url();
  const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth|token|supabase/i.test(k)));
  sessionOk = !/auth\?mode=/.test(url) || ls.length > 0;
  console.log(`  attempt ${attempt}: turnstile=${how} url=${url.replace(BASE, "")} localStorage=${JSON.stringify(ls)} toast=${JSON.stringify(lastToast)}`);
  if (/quick check first/i.test(lastToast || "")) continue; // captcha not satisfied yet
  if (sessionOk) break;
  await page.waitForTimeout(2000);
}

const lsKeys = await page.evaluate(() => Object.keys(localStorage));
const sessionProbe = await page.evaluate(async () => {
  const raw = Object.entries(localStorage).find(([k]) => /auth-token/.test(k));
  if (!raw) return { present: false };
  try {
    const decoded = JSON.parse(atob(raw[1].split(".").length > 1 ? raw[1] : raw[1]));
    return { present: true, keys: Object.keys(decoded || {}) };
  } catch { return { present: true, opaque: true }; }
});
console.log("  AUTH REQUESTS:", net.length ? net : "NONE");
console.log("  final url:", page.url());
console.log("  localStorage keys:", JSON.stringify(lsKeys));
console.log("  session token present:", JSON.stringify(sessionProbe));
await page.screenshot({ path: `${OUT}/after-submit.png`, fullPage: true });

if (!sessionOk) {
  console.log("RESULT: NO SESSION — aborting route walk.");
  await browser.close();
  process.exit(2);
}

/* Walk the logged-in screens and map them. */
for (const route of ROUTES) {
  await page.goto(route.startsWith("http") ? route : BASE + route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const info = await page.evaluate(() => {
    const de = document.documentElement;
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const heads = Array.from(document.querySelectorAll("h1,h2,h3")).filter(vis).map((h) => `${h.tagName}:${h.innerText.replace(/\s+/g, " ").trim().slice(0, 48)}`);
    const btns = Array.from(document.querySelectorAll("button,a[role=button],a")).filter(vis).map((b) => (b.innerText || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 34)).filter(Boolean);
    const tabs = Array.from(document.querySelectorAll('[role="tab"], nav a, nav button')).filter(vis).map((t) => t.innerText.replace(/\s+/g, " ").trim().slice(0, 24)).filter(Boolean);
    return {
      url: location.pathname + location.search,
      pageH: de.scrollHeight,
      screens: +(de.scrollHeight / window.innerHeight).toFixed(2),
      headings: heads.slice(0, 14),
      buttons: btns.slice(0, 40),
      nav: tabs.slice(0, 14),
    };
  });
  console.log(`\n=== ROUTE ${route} ===`);
  console.log(JSON.stringify(info, null, 1));
  const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  await page.screenshot({ path: `${OUT}/route-${name}.png`, fullPage: true });
}

writeFileSync(`${OUT}/session-routes.json`, JSON.stringify({ base: BASE, email: EMAIL, routes: ROUTES }, null, 2));
await browser.close();
console.log("\nDONE");
