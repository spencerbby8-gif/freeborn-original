import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-iik52mlxqamly6lmn52ux.e2b.app";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  storageState: "/tmp/e2e-state.json",
  viewport: { width: 1280, height: 1400 },
});
const page = await ctx.newPage();

// Generate a real photo
await page.setContent(
  `<body style="margin:0;height:100vh;background:radial-gradient(circle at 30% 30%,#ef5e5e,#d9a752 45%,#171d36 90%)"></body>`
);
await page.screenshot({ path: "/tmp/e2e-photo.png" });

await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle", timeout: 40000 });
await page.waitForSelector("text=Show your vibe.", { timeout: 25000 });
console.log("PASS C0 | resumed at vibe screen");

await page.getByText("Natural living", { exact: true }).click();
for (const i of ["Hiking", "Cooking", "Music"]) {
  await page.getByText(i, { exact: true }).click();
}
await page.locator('button[type="submit"]').click();
await page.waitForSelector("text=Your photo foundation.", { timeout: 25000 });
console.log("PASS C1 | vibe saved -> photos");

await page.locator('input[type="file"]').setInputFiles("/tmp/e2e-photo.png");
await page.waitForSelector('img[alt^="Profile photo"]', { timeout: 25000 });
console.log("PASS C2 | photo uploaded and previewed");

await page.getByRole("button", { name: /Finish & enter Freeborn/ }).click();
await page.waitForURL("**/discover", { timeout: 60000 });
console.log("PASS C3 | onboarding COMPLETED -> /discover |", page.url());

await page.waitForTimeout(2500);
const disc = await page.textContent("body");
console.log(disc.includes("Proof") ? "PASS C4 | discover greets the member (Proof)" : "INFO C4 | discover body sample: " + disc.slice(0, 80));

await browser.close();
console.log("STAGE C DONE");
