import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "https://freeborn-git-landing-designed-a934d1-spencerbby8-5225s-projects.vercel.app/prototype";
const OUT = "/home/user/freeborn-ui/proto-reference";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const missing = [];
page.on("response", (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url().split("/").slice(-1)[0]}`); });

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const screens = await page.evaluate(() => [...document.querySelectorAll("[data-screen]")].map((s) => s.dataset.screen));
console.log("screens:", screens.join(", "));

// The phone frame is what we compare against — screenshot the element, not the page.
const phone = await page.$(".phone");
for (const name of screens) {
  const ok = await page.evaluate((n) => {
    const el = document.querySelector(`[data-screen="${n}"]`);
    if (!el) return false;
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    el.classList.add("active");
    return true;
  }, name);
  if (!ok) continue;
  await page.waitForTimeout(450);
  await (phone ?? page).screenshot({ path: `${OUT}/${name}.png` });
}

// Also grab the full page (all 15 laid out in the contact-sheet style)
await page.screenshot({ path: `${OUT}/_page.png`, fullPage: true });
console.log("400+ responses:", missing.length ? missing.slice(0, 10).join(", ") : "none");
console.log("captured", screens.length, "screens ->", OUT);
await browser.close();
