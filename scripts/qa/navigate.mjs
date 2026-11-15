/**
 * navigate.mjs — interactive Freeborn navigation/testing harness.
 *
 * Drives a real headless Chromium to NAVIGATE the app like a user: goto, scroll,
 * click, type, and observe — capturing screenshots AND DOM/behavioral metrics at
 * each step (element positions, active element, toast visibility, scroll heights).
 * This is how we "see it live," not just static captures.
 *
 * Usage:  node scripts/qa/navigate.mjs <scenario.json>
 * Env:    BASE=https://...   (default: live Production)
 *
 * Scenario step ops:
 *   {op:"goto", url}                      navigate
 *   {op:"wait", ms}                       pause
 *   {op:"scroll", y}                      window.scrollTo(0,y)
 *   {op:"scrollBottom"}                   scroll to document bottom
 *   {op:"click", sel}                     click CSS selector
 *   {op:"clickText", text}                click element containing text
 *   {op:"fill", sel, value}               type into an input
 *   {op:"shot", name, full?}              screenshot (viewport by default)
 *   {op:"eval", expr, label?}             evaluate JS in page; result captured
 *   {op:"metrics", label?}                capture scroll/viewport/activeElement/toast metrics
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const OUT = process.env.SHOT_DIR || "/home/user/freeborn-audit/evidence/screenshots";
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || "https://freeborndating.com";

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
const ctxOpts = scenario.context || { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + String(e).slice(0, 160)));

const trace = [];
const log = (o) => { trace.push(o); console.log(JSON.stringify(o)); };

const METRICS = () => {
  const de = document.documentElement;
  const active = document.activeElement;
  const toast = document.querySelector('[role="alert"], .fb-toast-in');
  const tb = toast ? toast.getBoundingClientRect() : null;
  return {
    scrollHeight: de.scrollHeight,
    innerHeight: window.innerHeight,
    scrollY: Math.round(window.scrollY),
    activeElement: active ? `${active.tagName}#${active.id || ""}.${(active.className || "").toString().split(" ")[0]}` : null,
    activeInViewport: active ? (() => { const r = active.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })() : null,
    toastPresent: Boolean(toast),
    toastRect: tb ? { top: Math.round(tb.top), bottom: Math.round(tb.bottom) } : null,
    toastFullyVisible: tb ? tb.top >= 0 && tb.bottom <= window.innerHeight : null,
  };
};

for (const step of scenario.steps) {
  const t = { op: step.op };
  try {
    switch (step.op) {
      case "goto":
        await page.goto(step.url.startsWith("http") ? step.url : BASE + step.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(step.waitAfter ?? 1500);
        t.url = page.url();
        break;
      case "wait":
        await page.waitForTimeout(step.ms ?? 1000);
        break;
      case "scroll":
        await page.evaluate((y) => window.scrollTo(0, y), step.y ?? 0);
        await page.waitForTimeout(400);
        break;
      case "scrollBottom":
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(400);
        break;
      case "click":
        await page.click(step.sel, { timeout: 8000 });
        await page.waitForTimeout(step.waitAfter ?? 600);
        t.sel = step.sel;
        break;
      case "clickText":
        await page.getByText(step.text, { exact: false }).first().click({ timeout: 8000 });
        await page.waitForTimeout(step.waitAfter ?? 600);
        t.text = step.text;
        break;
      case "fill":
        await page.fill(step.sel, step.value, { timeout: 8000 });
        await page.waitForTimeout(step.waitAfter ?? 300);
        t.sel = step.sel;
        break;
      case "shot":
        await page.screenshot({ path: `${OUT}/${step.name}.png`, fullPage: Boolean(step.full) });
        t.file = `${step.name}.png`;
        break;
      case "eval": {
        const val = await page.evaluate(step.expr);
        t.label = step.label || step.op;
        t.result = val;
        break;
      }
      case "metrics":
        t.label = step.label || "metrics";
        t.result = await page.evaluate(METRICS);
        break;
    }
    t.ok = true;
  } catch (e) {
    t.ok = false;
    t.error = String(e).split("\n")[0].slice(0, 160);
  }
  log(t);
}

console.log(JSON.stringify({ done: true, scenario: scenario.name, consoleErrors: consoleErrors.slice(0, 8) }));
await browser.close();
