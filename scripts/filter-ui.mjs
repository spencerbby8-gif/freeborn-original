import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-i9vdslhp69tr4xeclrblm.e2b.app";
const token = fs.readFileSync("/tmp/filtok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0007", aud: "authenticated", role: "authenticated", email: "e2e-filter@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
// ensure NO saved filters (default = show everyone)
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.removeItem("freeborn.filters"); }, ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);

const page = await ctx.newPage();
await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForSelector("article", { timeout: 25000 });
await page.waitForTimeout(1500);

// The bug scenario: member has a location, default filters. Room must NOT be empty.
const empty = await page.getByText("You've met everyone here today.").count();
const noMatch = await page.getByText("No one matches those filters yet.").count();
const cardName = await page.locator("article h2").first().textContent().catch(() => "none");
console.log(empty === 0 && noMatch === 0 ? `PASS | located member + default filters -> deck NOT empty (shows "${cardName}")` : `FAIL | empty=${empty} noMatch=${noMatch}`);

// Open filter panel and confirm all sections render
await page.getByRole("button", { name: /filters/i }).first().click();
await page.waitForSelector("text=Age range", { timeout: 10000 }).catch(() => {});
const sections = {
  age: await page.getByText("Age range").count(),
  gender: await page.getByText("Show me").count(),
  distance: await page.getByText("Maximum distance").count(),
  verified: await page.getByText("Verified members only").count(),
  online: await page.getByText("Online now").count(),
  vax: await page.getByText("Vaccination stance").count(),
  lifestyle: await page.getByText("Lifestyle").count(),
  interests: await page.getByText("Hobbies & interests").count(),
  intent: await page.getByText("Relationship intent").count(),
};
const allPresent = Object.values(sections).every((c) => c > 0);
console.log(allPresent ? `PASS | filter panel has all sections: ${Object.keys(sections).join(", ")}` : `FAIL | sections: ${JSON.stringify(sections)}`);

// Apply "online only" and confirm the deck filters
await page.getByText("Online now").click();
await page.getByRole("button", { name: /Apply filters/ }).click();
await page.waitForTimeout(2000);
const onlineCards = await page.locator("article h2").count();
console.log(onlineCards >= 1 ? `PASS | after applying 'online only', deck still renders (${onlineCards} card shown)` : "FAIL | deck empty after online filter");
await browser.close();
console.log("FILTER_UI_DONE");
