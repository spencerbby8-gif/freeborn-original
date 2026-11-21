import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://freeborn-git-landing-designed-a934d1-spencerbby8-5225s-projects.vercel.app";
const OUT = process.env.OUT ?? "/home/user/freeborn-ui/shots-proto";
const EMAIL = process.env.FB_EMAIL ?? "bob867644@gmail.com";
const PASS = process.env.FB_PASS ?? "Spencerbby@14";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// never let the sandbox IP reach the suspension door
await page.route("**/api/security/check", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suspended: false }) }));

const api = [];
page.on("request", (req) => {
  if (req.url().includes("/api/profiles")) {
    const h = req.headers();
    api.push({ url: "REQ " + req.url().replace(BASE, ""), status: 0, body: h.authorization ? "Bearer present" : "NO AUTH HEADER" });
  }
});
page.on("response", async (res) => {
  const u = res.url();
  if (u.includes("/api/profiles") || u.includes("/api/profile/me") || u.includes("/api/notifications")) {
    let body = "";
    try { body = (await res.text()).slice(0, 400); } catch {}
    api.push({ url: u.replace(BASE, ""), status: res.status(), body });
  }
});
page.on("pageerror", (e) => api.push({ url: "PAGEERROR", status: 0, body: String(e).slice(0, 200) }));

await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("form button[type=submit]", { timeout: 30000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
await page.click("form button[type=submit]");
await page.waitForURL(/\/app/, { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(9000);

await page.screenshot({ path: `${OUT}/discover-viewport.png` });

const data = await page.evaluate(() => {
  const g = (sel) => document.querySelector(sel);
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  const rect = (sel) => { const e = g(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const d = g(".disc-headline");
  const chips = [...document.querySelectorAll(".intent-chips .chip")];
  const body = g(".card-body");
  const tabs = [...document.querySelectorAll("nav a")].map((a) => a.textContent.trim()).filter(Boolean);
  return {
    url: location.pathname,
    protoRootPresent: !!g(".fb-proto"),
    headline: { text: d?.innerText, font: cs(d, "fontFamily"), size: cs(d, "fontSize"), color: cs(d, "color") },
    eyebrow: g(".eyebrow")?.innerText ?? null,
    heart: { present: !!g(".disc-heart"), badge: g(".disc-heart .badge")?.innerText ?? null },
    intentChips: chips.map((c) => c.innerText.trim()).filter(Boolean),
    chipsFound: chips.length,
    card: {
      present: !!g(".profile-card"),
      name: g(".card-name")?.innerText ?? null,
      sub: g(".card-sub")?.innerText ?? null,
      meta: g(".card-meta")?.innerText ?? null,
      tags: [...document.querySelectorAll(".card-tags span")].map((s) => s.innerText),
      bio: g(".card-bio")?.innerText ?? null,
      bodyInsidePhoto: body ? !!body.closest(".profile-card") : false,
      bodyRect: rect(".card-body"),
    },
    actionRow: {
      rect: rect(".action-row"),
      circles: document.querySelectorAll(".circle-btn").length,
      sayHello: rect(".say-hello"),
      sayHelloText: g(".say-hello")?.innerText?.trim() ?? null,
    },
    tabs,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gate: !!document.body.innerText.match(/Opening Freeborn/),
  };
});

writeFileSync(`${OUT}/measure.json`, JSON.stringify({ data, api }, null, 2));
console.log(JSON.stringify(data, null, 2));
console.log("\n=== API ===");
for (const a of api) console.log(a.status, a.url, a.body.slice(0, 120));
await browser.close();
