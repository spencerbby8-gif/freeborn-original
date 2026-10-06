import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-izxadd4lmonf5mx680w96.e2b.app";
const token = fs.readFileSync("/tmp/tok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0005", aud: "authenticated", role: "authenticated", email: "e2e-proof@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);

/* 1) Bottom tabs on desktop + filters panel */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=The room is open.", { timeout: 25000 });
  const bottomNav = page.locator("nav.fixed.inset-x-0.bottom-0");
  const labels = await bottomNav.locator("a").allTextContents().catch(() => []);
  console.log(labels.length === 5 ? `PASS | bottom tabs always visible (${labels.join(", ")})` : `FAIL | bottom tabs: ${labels.length}`);

  await page.getByRole("button", { name: /Filters/ }).first().click();
  await page.waitForSelector("text=Vaccination stance", { timeout: 8000 }).catch(() => {});
  const panel = await page.getByText("Vaccination stance").count();
  const unvax = await page.getByText("Unvaccinated only").count();
  console.log(panel > 0 && unvax > 0 ? "PASS | filters: distance + vaccination stance" : `FAIL | filters panel=${panel} unvax=${unvax}`);
  await page.locator("text=Reset").click().catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape").catch(() => {});
  await page.close();
}

/* 2) Photo gallery swipe (tap dots) + super like double-tap */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  await page.waitForTimeout(600);

  // swipe photo: drag across the photo leftwards to advance gallery
  const photo = page.locator("article img").first();
  let box = await photo.boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const dots = page.locator("article div.pointer-events-none.absolute.inset-x-0.top-3 span");
  const widths = await dots.evaluateAll((els) => els.map((e) => e.className.includes("w-6"))).catch(() => []);
  console.log(widths.length && widths.findIndex(Boolean) === 1 ? "PASS | photo swipe advances gallery" : `FAIL | gallery dots=${JSON.stringify(widths)}`);

  // super like: double-tap the photo
  box = await photo.boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(180);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1400);
  const bubble = await page.locator(".superlike-bubble").count();
  const stoast = await page.getByText("Super like sent").count();
  console.log(bubble > 0 || stoast > 0 ? `PASS | double-tap super like (bubble=${bubble} toast=${stoast})` : `FAIL | superlike bubble=${bubble} toast=${stoast}`);
  await page.close();
}

/* 3) Card swipe to discard — drag from the info area */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  await page.waitForTimeout(500);
  const card = page.locator("article").first();
  const box = await card.boundingBox();
  // drag from the lower info section leftwards to discard
  const startX = box.x + box.width * 0.6, startY = box.y + box.height * 0.85;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 200, startY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  console.log("CARD_DISCARD_GESTURE_DONE");
  await page.close();
}

/* 4) Settings area tabs */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=Pick an area", { timeout: 25000 });
  const tabs = await page.locator("button[aria-pressed]").allTextContents();
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await page.waitForTimeout(400);
  const dist = await page.getByText("Maximum distance").count();
  console.log(tabs.length === 5 && dist > 0 ? `PASS | settings areas (${tabs.join("|")})` : `FAIL | settings tabs=${tabs.length} dist=${dist}`);
  await page.close();
}

await browser.close();
console.log("GESTURE_SUITE_DONE");
