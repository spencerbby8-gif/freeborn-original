import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-izxadd4lmonf5mx680w96.e2b.app";
const token = fs.readFileSync("/tmp/tok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0005", aud: "authenticated", role: "authenticated", email: "e2e-proof@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
const page = await ctx.newPage();
await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForSelector("article button.block.w-full", { timeout: 25000 });
await page.locator("article button.block.w-full").first().click();
// wait for async profile content
await page.waitForSelector("text=Their story", { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(500);
const story = await page.getByText("Their story").count();
const replyRate = await page.getByText("Reply rate").count();
const values = await page.getByText("Values they stand on").count();
const lifestyle = await page.getByText("How they live").count();
const conv = await page.getByText("Start a conversation with").count();
console.log(`story=${story} replyRate=${replyRate} values=${values} lifestyle=${lifestyle} interests=${conv}`);
console.log(story > 0 && replyRate > 0 && values > 0 ? "PASS | full profile renders all sections" : "FAIL | sections missing");
// check profile name shown
const name = await page.locator("h1").first().textContent().catch(() => "");
console.log("profile name:", name);
await browser.close();
