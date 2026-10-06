import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://3000-ii8wxqnverjjwiojg5km1.e2b.app";

// tiny valid PNG (1x1 red)
const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
fs.writeFileSync("/tmp/test-photo.png", Buffer.from(pngB64, "base64"));

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);

const browser = await chromium.launch({
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});

/* ---------- 1) PHOTOS: upload, preview, continue saves ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=photos`, { waitUntil: "networkidle" });
  const input = page.locator('input[type="file"]');
  await input.setInputFiles("/tmp/test-photo.png");
  await page.waitForTimeout(2500);
  const tiles = await page.locator('img[alt^="Profile photo"]').count();
  ok("photos: uploaded image shows a preview tile", tiles >= 1, `${tiles} tile(s)`);
  const counter = await page.textContent("body");
  ok("photos: ready counter shown", counter.includes("of 6 ready"));
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(800);
  const payload = await page.locator("#saved-payload").textContent();
  const parsed = JSON.parse(payload || "{}");
  ok(
    "photos: Continue saves photo payload (data URL + cover flag)",
    Array.isArray(parsed.photos) && parsed.photos.length === 1 && parsed.photos[0].src.startsWith("data:image") && parsed.photos[0].isCover === true,
    payload ? payload.slice(0, 60) + "…" : "empty"
  );
  await ctx.close();
}

/* ---------- 2) VERIFICATION: camera opens, capture saves selfie ---------- */
{
  const ctx = await browser.newContext({ permissions: ["camera"] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=verification`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open camera" }).click();
  await page.waitForTimeout(3000);
  const liveChip = await page.getByText("Camera live").count();
  ok("verification: camera opens with live viewfinder", liveChip >= 1);
  await page.getByRole("button", { name: "Capture selfie" }).click();
  await page.waitForTimeout(1200);
  const savedChip = await page.getByText("Selfie saved").count();
  ok("verification: capture produces saved selfie", savedChip >= 1);
  const payload = await page.locator("#saved-payload").textContent();
  const parsed = JSON.parse(payload || "{}");
  ok(
    "verification: selfie payload saved (status submitted + image)",
    parsed.verification?.status === "submitted" && String(parsed.verification?.selfie || "").startsWith("data:image")
  );
  await ctx.close();
}

/* ---------- 3) LOCATION: GPS grabs coords and auto-fills city ---------- */
{
  const ctx = await browser.newContext();
  await ctx.setGeolocation({ latitude: 30.2672, longitude: -97.7431 });
  await ctx.grantPermissions(["geolocation"]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=location`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Use my location/ }).click();
  await page.waitForTimeout(6000);
  const detected = await page.getByText(/Detected:/).count();
  const cityVal = await page.locator('input[id="city"]').inputValue();
  ok("location: GPS detected place name", detected >= 1);
  ok("location: city auto-filled", cityVal.length > 0, `city="${cityVal}"`);
  await ctx.close();
}

/* ---------- 4) PREFERENCES: pills + toggles save correctly ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=preferences`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "150 km" }).click();
  await page.getByText("Verified members only").click();
  await page.getByText("Woman", { exact: true }).click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(800);
  const payload = await page.locator("#saved-payload").textContent();
  const parsed = JSON.parse(payload || "{}");
  ok("preferences: distance pill saved", parsed.distance_km === 150, `distance_km=${parsed.distance_km}`);
  ok("preferences: verified-only toggle saved", parsed.verified_only === true);
  ok("preferences: gender label→value mapping", Array.isArray(parsed.show_genders) && parsed.show_genders.includes("Woman"));
  await ctx.close();
}

/* ---------- 5) PROGRESS RAIL: 12 nodes ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=progress`, { waitUntil: "networkidle" });
  const nodes = await page.locator('[aria-label^="Onboarding progress"]').locator("span[title]").count();
  ok("progress: rail renders 12 step circles", nodes === 12, `${nodes} nodes`);
  await ctx.close();
}

/* ---------- 6) LANDING: cards + badge icon, no 'Verified' text claim ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const roomHeading = await page.getByText("The room you're walking into").count();
  ok("landing: 'meet the room' section present", roomHeading >= 1);
  const badgeSvgs = await page.locator('span[title="Trust-verified member"]').count();
  ok("landing: verify badge icons present", badgeSvgs >= 3, `${badgeSvgs} badges`);
  const body = await page.textContent("body");
  ok("landing: no 'Verified' text claim", !/\bVerified\b/.test(body || ""));
  await ctx.close();
}

/* ---------- 7) ONBOARDING page: pill removed ---------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
  const body = await page.textContent("body");
  ok("onboarding: 'Private onboarding' pill removed", !body.includes("Private onboarding"));
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} PASSED`);
