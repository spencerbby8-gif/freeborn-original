import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-i6gipzc6qr7oablffprmu.e2b.app";
const token = fs.readFileSync("/tmp/navtok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0006", aud: "authenticated", role: "authenticated", email: "e2e-nav@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);
const page = await ctx.newPage();
await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForSelector("article", { timeout: 25000 });
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => {
    const b = document.querySelector("button[aria-label='Pass (discard)']");
    if (b) b.click();
  });
  await page.waitForTimeout(900);
}
await page.waitForTimeout(600);
const empty = await page.getByText("You've met everyone here today.").count();
const again = await page.getByText("Meet them again").count();
const tabs = await page.locator("nav.fixed.inset-x-0.bottom-0 a").count();
console.log(empty > 0 && again > 0 && tabs === 5 ? `PASS | empty room: tabs=${tabs}, 'Meet them again' present` : `FAIL | empty=${empty} again=${again} tabs=${tabs}`);
// Meet them again restores the deck
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Meet them again"));
  if (b) b.click();
});
await page.waitForTimeout(700);
const deckBack = await page.locator("article").count();
console.log(deckBack > 0 ? "PASS | 'Meet them again' restores the deck" : "FAIL | deck not restored");
await browser.close();
