import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-i1eoxdgo33a0rg6yb3g1a.e2b.app";
const token = fs.readFileSync("/tmp/tok.txt", "utf8").trim();
const session = JSON.stringify({
  access_token: token,
  token_type: "bearer",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  refresh_token: "e2e-refresh",
  user: {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-proof@freeborn.app",
    email_confirmed_at: "2026-10-05T21:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-10-05T21:00:00Z",
    updated_at: "2026-10-05T21:00:00Z",
  },
});
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext();
await ctx.addInitScript(
  ([key, value]) => localStorage.setItem(key, value),
  ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]
);

const checks = [
  ["/app", "Discover", ["Discover", "Likes", "Chat", "Alerts", "Settings"]],
  ["/app/likes", "Likes", ["Mara", "Liked"]],
  ["/app/chat", "Chat", ["Mara", "I like that."]],
  ["/app/notifications", "Alerts", ["New match: Mara"]],
  ["/app/settings", "Settings", ["Profile", "Discovery", "Notifications", "Privacy", "Account"]],
];

for (const [path, label, expects] of checks) {
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(6000);
  const body = (await page.textContent("body")) || "";
  const missing = expects.filter((e) => !body.includes(e));
  if (path === "/app/settings") {
    const val = await page.locator("input").first().inputValue().catch(() => "");
    if (val !== "Fresh Check") missing.push(`display-name-input=${val}`);
  }
  console.log(missing.length === 0 ? `PASS | ${label} page renders (${path})` : `FAIL | ${label} missing: ${missing.join(", ")}`);
  await page.close();
}
await browser.close();
