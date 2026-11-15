/**
 * session-driver.mjs — operate Freeborn's logged-in screens like a human.
 *
 * OWNER-AUTHORISED (2026-11-10): one test account, and bypassing the human check
 * in this QA browser, for development. This script never touches the shipped
 * app's security: it creates the member through Supabase's own signup endpoint
 * (the Preview project auto-confirms and enforces no server-side captcha), then
 * loads the resulting session into a throwaway QA browser exactly the way
 * @supabase/ssr and auth-js store it (localStorage raw JSON + the `base64-`
 * base64url cookie), and then CLICKS through the real UI.
 *
 * Usage:
 *   BASE=... ROUTES='/app,/app/profile' node scripts/qa/session-driver.mjs
 * Creds from .secrets/preview-qa-account (line1 email, line2 password),
 * key  from .secrets/preview-anon-key. Nothing secret is printed.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborn-5xwktk71i-spencerbby8-5225s-projects.vercel.app";
const OUT = process.env.SHOT_DIR || "/home/user/freeborn-audit/evidence/screenshots/loggedin";
const ROUTES = (process.env.ROUTES || "/app,/app/profile,/app/settings").split(",").map((s) => s.trim()).filter(Boolean);
const SECRETS = "/home/user/freeborn-audit/.secrets";
mkdirSync(OUT, { recursive: true });

const [EMAIL, PASSWORD] = readFileSync(`${SECRETS}/preview-qa-account`, "utf8").trim().split("\n");
const ANON = readFileSync(`${SECRETS}/preview-anon-key`, "utf8").trim();
/* The Supabase project ref comes from the app's NEXT_PUBLIC_SUPABASE_URL (read
   out of the deployed bundle), NOT from the Vercel hostname. */
const ref = process.env.SUPABASE_REF || "paskturljojjopxhnrik";
const host = new URL(BASE).hostname;

async function api(path, body) {
  const res = await fetch(`https://${ref}.supabase.co/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

let s = await api("signup", { email: EMAIL, password: PASSWORD });
console.log("signup status:", s.status, "| has session:", Boolean(s.json?.access_token), "| user id:", s.json?.user?.id ?? null);
if (!s.json?.access_token) {
  s = await api("token?grant_type=password", { email: EMAIL, password: PASSWORD });
  console.log("password-grant status:", s.status, "| has session:", Boolean(s.json?.access_token));
}
const session = s.json;
if (!session?.access_token) { console.log("FATAL: no session. detail:", JSON.stringify(session).slice(0, 200)); process.exit(2); }

const rawJson = JSON.stringify(session);
const cookieValue = "base64-" + Buffer.from(rawJson, "utf8").toString("base64url");
const cookieName = `sb-${ref}-auth-token`;
console.log("cookie name:", cookieName, "| cookie bytes:", cookieValue.length, "(single chunk if <=3180)");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies([{
  name: cookieName, value: cookieValue, domain: host, path: "/",
  secure: true, sameSite: "Lax", httpOnly: false, expires: Math.floor(Date.now() / 1000) + 3600,
}]);
/* Seed localStorage ONCE on a same-origin page, then let the app's own client
   own the session (refresh rotation). Re-injecting on every navigation would
   restore a stale token and fight the rotation. */
const seedPage = await ctx.newPage();
await seedPage.goto(BASE + "/auth?mode=sign-in", { waitUntil: "domcontentloaded" });
await seedPage.evaluate(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [cookieName, rawJson]);
await seedPage.close();

const page = await ctx.newPage();
const nav = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) nav.push(f.url().replace(BASE, "")); });

const map = () => page.evaluate(() => {
  const de = document.documentElement;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const txt = (el) => (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  return {
    url: location.pathname + location.search,
    pageH: de.scrollHeight,
    screens: +(de.scrollHeight / window.innerHeight).toFixed(2),
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(vis).map((h) => `${h.tagName}:${txt(h).slice(0, 44)}`).slice(0, 16),
    clickables: Array.from(document.querySelectorAll("button,a")).filter(vis).map(txt).filter(Boolean).slice(0, 46),
    inputs: Array.from(document.querySelectorAll("input,select,textarea")).filter(vis).map((i) => i.id || i.name || i.type).slice(0, 20),
    sections: Array.from(document.querySelectorAll("section,[class*=card],[class*=surface]")).filter(vis).map((el) => ({ h: el.offsetHeight, t: txt(el).slice(0, 40) })).filter((x) => x.h > 40).slice(0, 14),
  };
});

async function stableMap() {
  // Client-side redirects destroy the execution context; retry until settled.
  for (let i = 0; i < 5; i++) {
    try {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2500);
      const m = await map();
      if (m.headings.length || m.clickables.length || i === 4) return m;
    } catch { await page.waitForTimeout(1500); }
  }
  return map();
}

async function safeGoto(url) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }); return true; }
    catch { await page.waitForTimeout(2000); }
  }
  return false;
}

console.log("\n=== session accepted by the app? ===");
for (const route of ROUTES) {
  nav.length = 0;
  await safeGoto(BASE + route);
  await page.waitForTimeout(3500);
  const m = await stableMap();
  const uniqNav = [...new Set(nav)];
  const bounced = /\/auth/.test(m.url);
  console.log(`\nROUTE ${route} -> final ${m.url} ${bounced ? "⚠ BOUNCED TO AUTH" : "✓ logged-in"}`);
  console.log(`  navigations (deduped, raw=${nav.length}):`, uniqNav.join(" -> ") || "(none)");
  console.log("  height:", m.pageH, `(${m.screens} screens)`);
  console.log("  headings:", JSON.stringify(m.headings));
  console.log("  sections:", JSON.stringify(m.sections).slice(0, 900));
  console.log("  clickables:", JSON.stringify(m.clickables).slice(0, 1400));
  console.log("  inputs:", JSON.stringify(m.inputs));
  const name = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  await page.screenshot({ path: `${OUT}/live-${name}.png`, fullPage: true });
}

await browser.close();
console.log("\nDONE");
