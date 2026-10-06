import { chromium } from "playwright";
const BASE = "https://3000-iik52mlxqamly6lmn52ux.e2b.app";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  storageState: "/tmp/e2e-state.json",
  viewport: { width: 1280, height: 1400 },
});
await ctx.setGeolocation({ latitude: 30.2672, longitude: -97.7431 });
await ctx.grantPermissions(["geolocation"]);
const page = await ctx.newPage();

// Resume exactly where stage A left off (fresh navigation = resume check)
await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle", timeout: 40000 });
await page.waitForSelector("text=Where are you based?", { timeout: 25000 });
console.log("PASS B0 | resumed at the saved step (location)");

await page.getByRole("button", { name: /Use my location/ }).click();
await page.waitForFunction(
  () => document.querySelector('input[id="city"]')?.value !== "",
  { timeout: 25000 }
).catch(() => {});
const cityVal = await page.locator('input[id="city"]').inputValue();
console.log(cityVal ? `PASS B1 | GPS auto-filled city: "${cityVal}"` : "FAIL B1 | city not filled");
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=What are you looking for?", { timeout: 25000 });
console.log("PASS B2 | location saved -> intentions");

await page.getByText("Life partner", { exact: true }).click();
await page.getByText("Honesty", { exact: true }).click();
await page.getByText("Loyalty", { exact: true }).click();
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Write your first impression.", { timeout: 25000 });
console.log("PASS B3 | intentions + values saved -> about");

await page.locator('textarea[id="bio"]').fill("Here to prove the whole journey works, end to end, with receipts.");
await page.getByRole("button", { name: "Browse occupation options" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "Engineer", exact: true }).click();
const occVal = await page.locator('input[id="occupation"]').inputValue();
console.log(occVal === "Engineer" ? "PASS B4 | occupation picked from combo list" : `FAIL B4 | occupation="${occVal}"`);
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Show your vibe.", { timeout: 25000 });
console.log("PASS B5 | about saved -> vibe screen");

await ctx.storageState({ path: "/tmp/e2e-state.json" });
await browser.close();
console.log("STAGE B DONE");
