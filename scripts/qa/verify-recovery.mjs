/**
 * verify-recovery.mjs — proves the password-recovery captcha fix end to end.
 *
 * Run 1 (no stub): confirms the Turnstile widget now RENDERS on
 *   /auth?mode=reset-password, which was the missing precondition.
 * Run 2 (stubbed widget, IN THE TEST BROWSER ONLY): supplies a token through
 *   Turnstile's own callback so the app's guard can pass, then watches the
 *   network to confirm a real POST to /auth/v1/recover finally fires.
 * Run 3: /auth?mode=update-password must render NO widget and must NOT be
 *   blocked by the guard (it fires /auth/v1/user instead).
 *
 * Nothing here changes the app: the stub lives in the Playwright page only.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "https://freeborndating.com";
const OUT = process.env.SHOT_DIR || "/home/user/freeborn-audit/evidence/screenshots";
const EMAIL = "qa-live@example.com";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function newPage(stubTurnstile) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (stubTurnstile) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "turnstile", {
        configurable: true,
        value: {
          render: (_el, opts) => {
            setTimeout(() => opts.callback && opts.callback("QA-STUB-TOKEN"), 60);
            return "qa-stub-widget";
          },
          remove: () => {},
        },
      });
    });
  }
  const page = await ctx.newPage();
  const authCalls = [];
  page.on("request", (r) => {
    if (/supabase\.co\/auth\/v1\//.test(r.url())) {
      authCalls.push(`${r.method()} ${r.url().replace(/^https:\/\//, "").replace(/^[^/]+/, "")}`);
    }
  });
  return { ctx, page, authCalls };
}

const toastOf = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('[role="alert"], .fb-toast-in');
    return t ? t.innerText.replace(/\s+/g, " ").trim().slice(0, 140) : null;
  });

async function driveReset(label, stub) {
  const { ctx, page, authCalls } = await newPage(stub);
  await page.goto(`${BASE}/auth?mode=reset-password`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const widget = await page.evaluate(() => {
    const cf = document.querySelector(".cf-turnstile");
    return { present: !!cf, h: cf ? cf.offsetHeight : 0, iframe: !!document.querySelector(".cf-turnstile iframe") };
  });
  console.log(`\n[${label}] reset-password widget:`, JSON.stringify(widget));
  await page.fill("#email", EMAIL);
  await page.click("button[type=submit]");
  await page.waitForTimeout(6000);
  console.log(`[${label}] toast:`, JSON.stringify(await toastOf(page)));
  console.log(`[${label}] Supabase auth requests fired:`, authCalls.length ? authCalls : "NONE");
  await page.screenshot({ path: `${OUT}/recovery-${label}.png`, fullPage: true });
  await ctx.close();
  return { widget, authCalls };
}

console.log("BASE =", BASE);
await driveReset("unstubbed", false);
await driveReset("stubbed-token", true);

/* update-password: no widget, must not be captcha-blocked */
{
  const { ctx, page, authCalls } = await newPage(true);
  await page.goto(`${BASE}/auth?mode=update-password`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const widget = await page.evaluate(() => !!document.querySelector(".cf-turnstile"));
  const fields = await page.evaluate(() => Array.from(document.querySelectorAll("input:not([type=hidden])")).map((i) => i.id));
  console.log(`\n[update-password] widget present (want false): ${widget} | fields: ${JSON.stringify(fields)}`);
  await page.fill("#password", "QaStr0ng!pass");
  await page.click("button[type=submit]");
  await page.waitForTimeout(6000);
  console.log("[update-password] toast:", JSON.stringify(await toastOf(page)));
  console.log("[update-password] Supabase auth requests fired:", authCalls.length ? authCalls : "NONE");
  await page.screenshot({ path: `${OUT}/recovery-update-password.png`, fullPage: true });
  await ctx.close();
}

/* all-mode heights on this build */
console.log("\n=== heights by mode (390x844, fonts settled) ===");
for (const mode of ["sign-in", "sign-up", "reset-password", "update-password"]) {
  const { ctx, page } = await newPage(false);
  await page.goto(`${BASE}/auth?mode=${mode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const m = await page.evaluate(() => {
    const f = document.querySelector("form");
    const card = f ? f.closest(".surface") : null;
    const sub = document.querySelector('button[type="submit"]');
    const r = sub ? sub.getBoundingClientRect() : null;
    return {
      pageH: document.documentElement.scrollHeight,
      screens: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(2),
      cardH: card ? card.offsetHeight : null,
      submitVisibleNoScroll: r ? r.top >= 0 && r.bottom <= window.innerHeight : null,
      fields: Array.from(document.querySelectorAll("input:not([type=hidden])")).map((i) => i.id),
      widget: !!document.querySelector(".cf-turnstile"),
    };
  });
  console.log(`  ${mode.padEnd(16)} ${JSON.stringify(m)}`);
  await page.screenshot({ path: `${OUT}/mode-${mode}.png`, fullPage: true });
  await ctx.close();
}

await browser.close();
