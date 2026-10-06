import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://3000-ibbscghhykumw3uojhajg.e2b.app";
const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
fs.writeFileSync("/tmp/test-photo.png", Buffer.from(pngB64, "base64"));

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

/* 1) LOCATION DENIED INSIDE IFRAME → must show the "open in new tab" guidance */
{
  const ctx = await browser.newContext(); // no geolocation permission granted
  const page = await ctx.newPage();
  await page.setContent(
    `<iframe id="f" src="${BASE}/dev/step-test?step=location" style="width:800px;height:900px"></iframe>`,
    { waitUntil: "load" }
  );
  await page.waitForTimeout(3000);
  const frame = page.frameLocator("#f");
  await frame.getByRole("button", { name: /Use my location/ }).click();
  await page.waitForTimeout(5000);
  const txt = await frame.locator("body").textContent();
  ok("location: denied-in-iframe shows preview-panel guidance", /Open in new tab|preview panel/.test(txt || ""), (txt || "").slice(0, 90));
  await ctx.close();
}

/* 2) LOCATION GRANTED (top-level) → auto-fills city */
{
  const ctx = await browser.newContext();
  await ctx.setGeolocation({ latitude: 30.2672, longitude: -97.7431 });
  await ctx.grantPermissions(["geolocation"]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=location`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Use my location/ }).click();
  await page.waitForTimeout(7000);
  const cityVal = await page.locator('input[id="city"]').inputValue();
  const detected = await page.getByText(/Detected:/).count();
  ok("location: granted GPS auto-fills city", cityVal.length > 0, `city="${cityVal}"`);
  ok("location: detected chip shown", detected >= 1);
  await ctx.close();
}

/* 3) ABOUT: occupation browse-and-pick + education manual entry */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=about`, { waitUntil: "networkidle" });

  // occupation: open browser list via chevron, pick "Nurse"
  await page.getByRole("button", { name: "Browse occupation options" }).click();
  await page.waitForTimeout(400);
  const listVisible = await page.locator('div[role="listbox"]').isVisible();
  ok("about: occupation options open as Freeborn panel", listVisible);
  const optCount = await page.locator('div[role="listbox"] button[role="option"]').count();
  ok("about: moderate option list (10-25)", optCount >= 10 && optCount <= 25, `${optCount} options`);
  await page.locator('div[role="listbox"]').getByRole("option", { name: "Nurse", exact: true }).click();
  await page.waitForTimeout(200);
  const occVal = await page.locator('input[id="occupation"]').inputValue();
  ok("about: occupation picked from list", occVal === "Nurse", occVal);

  // education: type a custom value (manual still allowed)
  await page.locator('input[id="education"]').fill("Night school diploma");
  await page.waitForTimeout(300);

  // bio valid → save
  await page.locator('textarea[id="bio"]').fill("Grounded, curious, and serious about building something that lasts.");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(500);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "about: saves picked occupation + manual education",
    parsed.occupation === "Nurse" && parsed.education === "Night school diploma",
    `${parsed.occupation} / ${parsed.education}`
  );
  await ctx.close();
}

/* 4) PHOTOS: upload still produces a save-ready payload */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=photos`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles("/tmp/test-photo.png");
  await page.waitForTimeout(2500);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(600);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "photos: upload → save-ready payload with data URL",
    parsed.photos?.length === 1 && String(parsed.photos[0].src).startsWith("data:image"),
    (await page.locator('button[type="submit"]').textContent()) || ""
  );
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} PASSED`);
process.exit(fails ? 1 : 0);
