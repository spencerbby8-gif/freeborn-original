import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-i6gipzc6qr7oablffprmu.e2b.app";
const token = fs.readFileSync("/tmp/navtok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0006", aud: "authenticated", role: "authenticated", email: "e2e-nav@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);

/* 1) Signed-in /discover must bounce into /app (tabs) */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/discover`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForURL("**/app", { timeout: 20000 }).catch(() => {});
  console.log(page.url().includes("/app") ? "PASS | signed-in /discover redirects to /app" : `FAIL | landed ${page.url()}`);
  await page.close();
}

/* 2) /app renders the deck + bottom tabs */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  const tabs = await page.locator("nav.fixed.inset-x-0.bottom-0 a").count();
  const first = await page.locator("article h2").first().textContent();
  console.log(tabs === 5 ? `PASS | /app has 5 bottom tabs, deck shows "${first}"` : `FAIL | tabs=${tabs}`);

  /* 3) Swipe through all 5 -> empty state STILL has tabs + Meet them again */
  for (let i = 0; i < 5; i++) {
    const btn = page.locator("button[aria-label='Pass (discard)']");
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(650); }
  }
  await page.waitForTimeout(800);
  const empty = await page.getByText("You've met everyone here today.").count();
  const again = await page.getByText("Meet them again").count();
  const tabsAfter = await page.locator("nav.fixed.inset-x-0.bottom-0 a").count();
  console.log(empty > 0 && again > 0 && tabsAfter === 5 ? "PASS | empty room still has tabs + 'Meet them again'" : `FAIL | empty=${empty} again=${again} tabs=${tabsAfter}`);
  await page.close();
}

/* 4) Completed member signs in -> straight to /app (no onboarding flash) */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.locator('input[id="email"]').fill("e2e-nav@freeborn.app");
  await page.locator('input[id="password"]').fill(process.env.E2E_PASSWORD ?? "");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/app", { timeout: 25000 }).catch(() => {});
  const url = page.url();
  const tabs = await page.locator("nav.fixed.inset-x-0.bottom-0 a").count().catch(() => 0);
  console.log(url.includes("/app") && tabs === 5 ? "PASS | completed member signs in -> /app with tabs" : `FAIL | url=${url} tabs=${tabs}`);
  await page.close();
}

await browser.close();
console.log("REDIRECT_SUITE_DONE");
