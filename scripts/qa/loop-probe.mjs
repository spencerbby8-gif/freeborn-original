/**
 * loop-probe.mjs — instrument the /app boot to find WHO redirects to /onboarding.
 * Hooks Location.prototype.replace/assign and the href setter, logging the JS
 * stack of every programmatic navigation, plus every HTTP response >= 400.
 * Owner-authorised QA session (Preview).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborn-5xwktk71i-spencerbby8-5225s-projects.vercel.app";
const REF = process.env.SUPABASE_REF || "paskturljojjopxhnrik";
const [EMAIL, PASSWORD] = readFileSync("/home/user/freeborn-audit/.secrets/preview-qa-account", "utf8").trim().split("\n");
const ANON = readFileSync("/home/user/freeborn-audit/.secrets/preview-anon-key", "utf8").trim();

const g = await fetch(`https://${REF}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const ses = await g.json();
if (!ses.access_token) { console.log("no session"); process.exit(2); }
const raw = JSON.stringify(ses);
const cookieName = `sb-${REF}-auth-token`;

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: cookieName, value: "base64-" + Buffer.from(raw).toString("base64url"), domain: new URL(BASE).hostname, path: "/", secure: true, sameSite: "Lax" }]);

const page = await ctx.newPage();
await page.addInitScript(() => {
  const mark = (how, url) => {
    const stack = (new Error().stack || "").split("\n").slice(1, 7).map((s) => s.trim().replace(/https?:\/\/[^/]+/, "")).join(" | ");
    console.log(`[REDIRECT:${how}] ${url} @@ ${stack}`);
  };
  const L = Location.prototype;
  const origReplace = L.replace, origAssign = L.assign;
  L.replace = function (u) { mark("replace", u); return origReplace.call(this, u); };
  L.assign = function (u) { mark("assign", u); return origAssign.call(this, u); };
  const hrefDesc = Object.getOwnPropertyDescriptor(L, "href");
  if (hrefDesc && hrefDesc.set) {
    Object.defineProperty(L, "href", { ...hrefDesc, set(v) { mark("href=", v); return hrefDesc.set.call(this, v); } });
  }
  const origFetch = window.fetch;
  window.fetch = async (...a) => {
    const r = await origFetch(...a);
    try { if (r.status >= 400) console.log(`[FETCH ${r.status}] ${String(a[0]).slice(0, 90)}`); } catch {}
    return r;
  };
});

const navs = [];
const t0 = Date.now();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(((Date.now() - t0) / 1000).toFixed(1) + "s " + f.url().replace(BASE, "")); });
page.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("[REDIRECT") || t.startsWith("[FETCH")) console.log(((Date.now() - t0) / 1000).toFixed(1) + "s " + t);
});

const seed = await ctx.newPage();
await seed.goto(BASE + "/auth?mode=sign-in", { waitUntil: "domcontentloaded" });
await seed.evaluate(([k, v]) => { localStorage.setItem(k, v); }, [cookieName, raw]);
await seed.close();

await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(15000);
console.log("NAV COUNT:", navs.length, "FINAL:", page.url().replace(BASE, ""));
await page.screenshot({ path: "/home/user/freeborn-audit/evidence/screenshots/loop-probe-final.png" });
await browser.close();
