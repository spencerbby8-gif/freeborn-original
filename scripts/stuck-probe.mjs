import { chromium } from "playwright";

const BASE = "https://3000-i3ix0g06unxh422g5ed2h.e2b.app";
const COOKIE_NAME = "sb-ihwtpwlszegrjgakqsxx-auth-token";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext();

// Simulate a browser carrying a CORRUPT/STALE supabase session cookie
await context.addCookies([
  { name: COOKIE_NAME, value: "corrupt-stale-junk-from-an-old-build", domain: new URL(BASE).host, path: "/" },
  { name: `${COOKIE_NAME}.0`, value: "chunk-junk-0", domain: new URL(BASE).host, path: "/" },
]);

const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 150)));

console.log("=== 1) /auth with corrupt cookie in browser ===");
const r1 = await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "domcontentloaded", timeout: 45000 });
console.log("status:", r1.status());

console.log("=== 2) /onboarding with corrupt cookie ===");
const r2 = await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 45000 });
console.log("status:", r2.status(), "final url:", page.url());

console.log("=== 3) /api/debug/auth with corrupt cookie ===");
const r3 = await page.goto(`${BASE}/api/debug/auth`, { waitUntil: "load", timeout: 45000 });
console.log("status:", r3.status());
const txt = await page.textContent("body");
console.log(txt.slice(0, 500));

await browser.close();
console.log("DONE");
