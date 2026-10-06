import { chromium } from "playwright";

const BASE = "https://3000-i3ix0g06unxh422g5ed2h.e2b.app";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext();
const page = await context.newPage();

const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];
const navigations = [];

page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`));
page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 400)));
page.on("requestfailed", (req) =>
  failedRequests.push(`${req.method()} ${req.url().slice(0, 120)} :: ${req.failure()?.errorText}`)
);
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) navigations.push(frame.url());
});

console.log("=== 1) LOAD /auth?mode=sign-in ===");
await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(2500);
console.log("title:", await page.title());
console.log("sign-in form present:", (await page.locator('input[id="email"]').count()) > 0);
console.log("password field present:", (await page.locator('input[id="password"]').count()) > 0);

console.log("\n=== 2) FILL + SUBMIT (unconfirmed test account — expect an error notice, NOT a reload) ===");
await page.locator('input[id="email"]').fill("audit-smoke@freeborn.app");
await page.locator('input[id="password"]').fill("AuditSmoke2026x");
const before = page.url();
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(6000);
const after = page.url();
console.log("url before:", before);
console.log("url after: ", after);
console.log("navigations recorded:", navigations.length);
const bodyText = await page.textContent("body");
console.log("shows 'Check your inbox':", bodyText.includes("Check your inbox"));
console.log("shows 'Confirm your email':", bodyText.includes("Confirm your email"));
console.log("shows \"couldn't finish\":", bodyText.includes("couldn't finish that"));
console.log("shows 'couldn't reach Freeborn':", bodyText.includes("couldn't reach Freeborn"));

console.log("\n=== 3) CLIENT-SIDE STATE ===");
console.log("document.cookie:", (await page.evaluate(() => document.cookie)).slice(0, 200) || "(empty)");
const ls = await page.evaluate(() => Object.keys(localStorage));
console.log("localStorage keys:", JSON.stringify(ls));

console.log("\n=== 4) CONSOLE + ERRORS + FAILED REQUESTS ===");
console.log("pageErrors:", pageErrors.length ? pageErrors : "none");
console.log("console errors:", consoleLogs.filter((l) => l.startsWith("[error]")).slice(0, 8));
console.log("failed requests:", failedRequests.length ? failedRequests.slice(0, 8) : "none");

console.log("\n=== 5) IFRAME COOKIE TEST (embed preview in cross-site iframe) ===");
const iframePage = await context.newPage();
await iframePage.setContent(
  `<html><body><iframe src="${BASE}/auth?mode=sign-in" style="width:900px;height:700px"></iframe></body></html>`,
  { waitUntil: "load" }
);
await iframePage.waitForTimeout(4000);
const frame = iframePage.frames().find((f) => f.url().includes("/auth"));
if (frame) {
  const emailInput = frame.locator('input[id="email"]');
  console.log("iframe auth form loaded:", (await emailInput.count()) > 0);
  await emailInput.fill("audit-smoke@freeborn.app");
  await frame.locator('input[id="password"]').fill("AuditSmoke2026x");
  await frame.locator('button[type="submit"]').click();
  await iframePage.waitForTimeout(6000);
  const iframeBody = await frame.textContent("body");
  console.log("iframe shows notice:", iframeBody.includes("Confirm your email") || iframeBody.includes("Check your inbox") || iframeBody.includes("couldn't"));
  const iframeCookies = await frame.evaluate(() => document.cookie);
  console.log("iframe document.cookie:", iframeCookies.slice(0, 150) || "(empty — cookies blocked in iframe)");
} else {
  console.log("iframe failed to load auth page");
}

await browser.close();
console.log("\nDONE");
