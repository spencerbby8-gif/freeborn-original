import { chromium } from "playwright";

const BASE = "https://3000-iik52mlxqamly6lmn52ux.e2b.app";
const EMAIL = "e2e-proof@freeborn.app";
const PASSWORD = process.env.E2E_PASSWORD ?? ""; // no credentials in source

const results = [];
const ok = (name, pass, detail = "") => {
  results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.setGeolocation({ latitude: 30.2672, longitude: -97.7431 });
await ctx.grantPermissions(["geolocation"]);
const page = await ctx.newPage();

/* Generate a real photo (screenshot of a colorful page) */
const gen = await ctx.newPage();
await gen.setContent(
  `<body style="margin:0;height:100vh;background:radial-gradient(circle at 30% 30%,#ef5e5e,#d9a752 45%,#171d36 90%)"></body>`
);
await gen.screenshot({ path: "/tmp/e2e-photo.png" });
await gen.close();

/* 1) SIGN IN through the real UI */
await page.goto(`${BASE}/auth?mode=sign-in`, { waitUntil: "networkidle", timeout: 60000 });
await page.locator('input[id="email"]').fill(EMAIL);
await page.locator('input[id="password"]').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL("**/onboarding", { timeout: 45000 }).catch(() => {});
ok("1. sign-in lands on /onboarding", page.url().includes("/onboarding"), page.url());

/* 2) WELCOME */
await page.waitForSelector("text=Get started", { timeout: 30000 });
await page.getByRole("button", { name: "Get started" }).click();
await page.waitForSelector('input[id="display_name"]', { timeout: 30000 });
ok("2. welcome -> identity", true);

/* 3) IDENTITY */
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
await page.waitForSelector("text=Where are you based?", { timeout: 30000 });
ok("3. identity saved -> location", true);

/* 4) LOCATION via GPS auto-fill */
await page.getByRole("button", { name: /Use my location/ }).click();
await page.waitForSelector('input[id="city"][value="Austin"]', { timeout: 30000 }).catch(() => {});
const cityVal = await page.locator('input[id="city"]').inputValue();
ok("4. GPS auto-filled city", cityVal === "Austin", `city="${cityVal}"`);
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=What are you looking for?", { timeout: 30000 });

/* 5) INTENTIONS */
await page.getByText("Life partner", { exact: true }).click();
await page.getByText("Honesty", { exact: true }).click();
await page.getByText("Loyalty", { exact: true }).click();
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Write your first impression.", { timeout: 30000 });
ok("5. intentions saved -> about", true);

/* 6) ABOUT with combo picks */
await page.locator('textarea[id="bio"]').fill("Here to prove the whole journey works, end to end, with receipts.");
await page.getByRole("button", { name: "Browse occupation options" }).click();
await page.locator('div[role="listbox"]').getByRole("option", { name: "Engineer", exact: true }).click();
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Show your vibe.", { timeout: 30000 });
ok("6. about saved -> vibe", true);

/* 7) VIBE */
await page.getByText("Natural living", { exact: true }).click();
for (const i of ["Hiking", "Cooking", "Music"]) {
  await page.getByText(i, { exact: true }).click();
}
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Your photo foundation.", { timeout: 30000 });
ok("7. vibe saved -> photos", true);

/* 8) PHOTOS — upload + Finish */
await page.locator('input[type="file"]').setInputFiles("/tmp/e2e-photo.png");
await page.waitForSelector('img[alt^="Profile photo"]', { timeout: 30000 });
await page.getByRole("button", { name: /Finish & enter Freeborn/ }).click();
await page.waitForURL("**/discover", { timeout: 60000 }).catch(() => {});
ok("8. photo saved + onboarding COMPLETED -> /discover", page.url().includes("/discover"), page.url());

await browser.close();
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} PASSED`);
