import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-it9tqk8zaxbam5cpuey10.e2b.app";
const token = fs.existsSync("/tmp/tok.txt") ? fs.readFileSync("/tmp/tok.txt", "utf8").trim() : null;
const browser = await chromium.launch({ args: ["--no-sandbox"] });

/* 1) Standalone home (/discover): real cards, no Create account */
{
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/discover`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=of 5 in the room", { timeout: 25000 });
  const body = await page.textContent("body");
  console.log(body.includes("Create account") ? "FAIL | 'Create account' still present" : "PASS | no 'Create account' button");
  console.log(body.includes("of 5 in the room") ? "PASS | home deck rendered (5 members)" : "FAIL | deck missing");
  console.log(body.includes("swipe the photos") ? "PASS | swipe hint present" : "FAIL | no swipe hint");

  /* 2) Real swipe gesture on the photos */
  const card = page.locator("article").first();
  const box = await card.boundingBox();
  const startX = box.x + box.width * 0.75;
  const y = box.y + box.height * 0.35;
  const activeDotBefore = await page.locator("span.w-6.bg-white").count();
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 60, y, { steps: 5 });
  await page.mouse.move(startX - 140, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const dots = page.locator("div.absolute.inset-x-0.top-3 span");
  const widths = await dots.evaluateAll((els) => els.map((e) => e.className.includes("w-6")));
  const activeIdx = widths.findIndex(Boolean);
  console.log(activeIdx === 1 ? "PASS | swipe moved photos to photo 2" : `FAIL | active dot index=${activeIdx} (dots=${JSON.stringify(widths)})`);

  /* swipe back */
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25 + 140, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const widths2 = await dots.evaluateAll((els) => els.map((e) => e.className.includes("w-6")));
  console.log(widths2.findIndex(Boolean) === 0 ? "PASS | swipe back returned to photo 1" : "FAIL | swipe back");
  await ctx.close();
}

/* 3) /app with session: shell + home deck */
if (token) {
  const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0004", aud: "authenticated", role: "authenticated", email: "home-check@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=The room is open.", { timeout: 25000 }).catch(() => {});
  const body = (await page.textContent("body")) || "";
  console.log(body.includes("The room is open.") ? "PASS | /app shows the real home screen" : "FAIL | /app home heading missing");
  console.log(body.includes("Discover") && body.includes("Likes") && body.includes("Chat") ? "PASS | app nav tabs present" : "FAIL | tabs missing");
  await ctx.close();
}
await browser.close();
