import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-izxadd4lmonf5mx680w96.e2b.app";
const token = fs.readFileSync("/tmp/tok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0005", aud: "authenticated", role: "authenticated", email: "e2e-proof@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);

/* 1) Card tap opens full profile */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  await page.waitForTimeout(600);
  // tap the info area (no drag) -> opens profile
  await page.locator("article button.block.w-full").first().click();
  await page.waitForSelector("text=Full profile", { timeout: 10000 }).catch(() => {});
  const overlay = await page.getByText("Full profile").count();
  const theirStory = await page.getByText("Their story").count();
  const replyRate = await page.getByText("Reply rate").count();
  const valuesBlock = await page.getByText("Values they stand on").count();
  console.log(overlay > 0 && theirStory > 0 ? `PASS | full profile opens (story=${theirStory}, replyRate=${replyRate}, values=${valuesBlock})` : `FAIL | profile overlay=${overlay} story=${theirStory}`);
  await page.close();
}

/* 2) Chat avatar opens profile */
{
  // ensure a match exists
  await fetch(`${BASE}/api/likes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ profileId: "11111111-0000-4000-8000-000000000002", choice: "like" }),
  }).catch(() => {});
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/chat`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3500);
  const avatarBtn = page.locator("button[aria-label^='View']").first();
  const hasAvatar = await avatarBtn.count();
  if (hasAvatar > 0) {
    await avatarBtn.click();
    await page.waitForSelector("text=Full profile", { timeout: 10000 }).catch(() => {});
    const overlay = await page.getByText("Full profile").count();
    console.log(overlay > 0 ? "PASS | chat avatar opens full profile" : "FAIL | chat avatar overlay missing");
  } else {
    console.log("FAIL | no chat match/avatar found");
  }
  await page.close();
}

await browser.close();
console.log("PROFILE_SUITE_DONE");
