import { chromium } from "playwright";
const BASE = "https://3000-iik52mlxqamly6lmn52ux.e2b.app";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.setGeolocation({ latitude: 30.2672, longitude: -97.7431 });
await ctx.grantPermissions(["geolocation"]);
const page = await ctx.newPage();

await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "networkidle", timeout: 40000 });
await page.locator('input[id="email"]').fill("e2e-proof@freeborn.app");
await page.locator('input[id="password"]').fill("E2eProof2026x");
await page.locator('button[type="submit"]').click();
await page.waitForURL("**/onboarding", { timeout: 40000 });
console.log("PASS A1 | sign-in -> /onboarding");

await page.waitForSelector("text=Get started", { timeout: 25000 });
await page.getByRole("button", { name: "Get started" }).click();
await page.waitForSelector('input[id="display_name"]', { timeout: 25000 });
console.log("PASS A2 | welcome -> identity");

await page.locator('input[id="display_name"]').fill("Proof");
await page.getByRole("button", { name: "Month" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "April", exact: true }).click();
await page.getByRole("button", { name: "Day" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "9", exact: true }).click();
await page.getByRole("button", { name: "Year" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "1995", exact: true }).click();
await page.getByRole("button", { name: "Choose how you identify" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "Woman", exact: true }).click();
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Where are you based?", { timeout: 25000 });
console.log("PASS A3 | identity saved -> location screen");

await ctx.storageState({ path: "/tmp/e2e-state.json" });
await browser.close();
console.log("STAGE A DONE");
