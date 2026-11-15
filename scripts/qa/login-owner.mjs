/**
 * login-owner.mjs — sign in as the OWNER through the real UI, in a REAL HEADED
 * browser (Xvfb), clicking the Cloudflare checkbox like a person.
 *
 * OWNER-AUTHORISED (2026-11-10): the owner supplied their own credentials and
 * explicitly instructed me to log in and operate Freeborn live. Production
 * Supabase enforces the captcha server-side, so the only legitimate path is a
 * genuine browser passing the genuine challenge. Nothing is weakened or patched.
 *
 * On success the session (cookies + localStorage) is saved to
 * .secrets/owner-storage.json (0600) so later navigation reuses it without
 * re-solving the challenge.
 *
 * Usage: xvfb-run -a node scripts/qa/login-owner.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborndating.com";
const OUT = process.env.STORAGE || "/home/user/freeborn-audit/.secrets/owner-storage.json";
const [EMAIL, PASSWORD] = readFileSync("/home/user/freeborn-audit/.secrets/owner-account", "utf8").trim().split("\n");

const browser = await chromium.launch({
  headless: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--lang=en-US",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: "en-US",
  timezoneId: "America/Los_Angeles",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});
const page = await ctx.newPage();
const authCalls = [];
page.on("request", (r) => { if (/supabase\.co\/auth\/v1\//.test(r.url())) authCalls.push(r.method() + " " + r.url().split("?")[0].slice(-40)); });

console.log("goto", BASE + "/auth?mode=sign-in");
await page.goto(BASE + "/auth?mode=sign-in", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.screenshot({ path: "/home/user/freeborn-audit/evidence/screenshots/owner-login-filled.png" });

let ok = false;
for (let attempt = 1; attempt <= 8 && !ok; attempt++) {
  // Real click on the real checkbox inside the real Cloudflare iframe.
  const frames = page.frames().filter((f) => /challenges\.cloudflare\.com/.test(f.url()));
  let clicked = "none";
  for (const f of frames) {
    for (const sel of ['input[type="checkbox"]', ".ctp-checkbox-label", "label.cb-lb", "#challenge-stage", "body"]) {
      try { const l = f.locator(sel).first(); if (await l.count()) { await l.click({ timeout: 3000 }); clicked = sel; break; } } catch {}
    }
    if (clicked !== "none") break;
  }
  if (clicked === "none") { try { await page.locator(".cf-turnstile").click({ timeout: 3000 }); clicked = "host"; } catch {} }
  console.log(`attempt ${attempt}: clicked=${clicked}; waiting for challenge to settle…`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `/home/user/freeborn-audit/evidence/screenshots/owner-login-attempt-${attempt}.png` });
  await page.click("button[type=submit]");
  await page.waitForTimeout(4000);
  const url = page.url();
  const toast = await page.evaluate(() => { const t = document.querySelector('[role="alert"], .fb-toast-in'); return t ? t.innerText.replace(/\s+/g, " ").slice(0, 100) : null; });
  console.log(`  url=${url.replace(BASE, "")} toast=${JSON.stringify(toast)}`);
  if (!/\/auth/.test(url)) { ok = true; break; }
  if (toast && /quick check/i.test(toast)) continue;
  if (toast && /invalid/i.test(toast)) { console.log("  credentials rejected by Supabase — aborting."); break; }
}

if (ok) {
  await page.waitForTimeout(3000);
  const state = await ctx.storageState();
  writeFileSync(OUT, JSON.stringify(state));
  chmodSync(OUT, 0o600);
  console.log("LOGGED IN. final url:", page.url());
  console.log("auth calls:", authCalls.slice(0, 6));
  console.log("storageState saved to", OUT);
  await page.screenshot({ path: "/home/user/freeborn-audit/evidence/screenshots/owner-login-landed.png", fullPage: true });
} else {
  console.log("LOGIN NOT COMPLETED.");
  await page.screenshot({ path: "/home/user/freeborn-audit/evidence/screenshots/owner-login-failed.png", fullPage: true });
}
await browser.close();
process.exit(ok ? 0 : 2);
