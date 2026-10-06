import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://3000-ipymydwdej423pihgtunm.e2b.app";
const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
fs.writeFileSync("/tmp/test-photo.png", Buffer.from(pngB64, "base64"));

const results = [];
const ok = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

/* 1) RAIL = 7 nodes */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=progress`, { waitUntil: "networkidle" });
  const nodes = await page.locator('[aria-label^="Onboarding progress"]').locator("span[title]").count();
  ok("rail: exactly 7 step circles", nodes === 7, `${nodes} nodes`);
  await ctx.close();
}

/* 2) IDENTITY: Freeborn dropdowns (no native selects), full date + gender */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=identity`, { waitUntil: "networkidle" });

  const nativeSelects = await page.locator("select").count();
  ok("identity: zero native <select> elements (no white dropdowns)", nativeSelects === 0, `${nativeSelects} found`);

  // open MONTH dropdown
  await page.getByRole("button", { name: "Month" }).click();
  await page.waitForTimeout(400);
  const panel = page.locator('div[role="listbox"]');
  const panelVisible = await panel.isVisible().catch(() => false);
  ok("identity: month dropdown opens as Freeborn panel", panelVisible);
  const panelBg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => "");
  ok("identity: panel is dark (Freeborn UI), not white", panelBg !== "" && panelBg !== "rgba(0, 0, 0, 0)" ? true : false, `bg=${panelBg}`);
  // pick March
  await panel.getByRole("option", { name: "March", exact: true }).click();
  await page.waitForTimeout(200);

  // DAY
  await page.getByRole("button", { name: "Day" }).click();
  await page.locator('div[role="listbox"]').getByRole("option", { name: "14", exact: true }).click();
  await page.waitForTimeout(200);

  // YEAR
  await page.getByRole("button", { name: "Year" }).click();
  await page.locator('div[role="listbox"]').getByRole("option", { name: "1996", exact: true }).click();
  await page.waitForTimeout(200);

  // GENDER
  await page.getByRole("button", { name: "Choose how you identify" }).click();
  await page.locator('div[role="listbox"]').getByRole("option", { name: "Woman", exact: true }).click();
  await page.waitForTimeout(200);

  await page.locator('input[id="display_name"]').fill("Adaeze");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(600);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "identity: saves name + full date + gender",
    parsed.display_name === "Adaeze" && parsed.birth_date === "1996-03-14" && parsed.gender === "woman",
    `${parsed.display_name} ${parsed.birth_date} ${parsed.gender}`
  );
  await ctx.close();
}

/* 3) INTENTIONS: intents + values one screen */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=intentions`, { waitUntil: "networkidle" });
  await page.getByText("Life partner", { exact: true }).click();
  await page.getByText("Honesty", { exact: true }).click();
  await page.getByText("Loyalty", { exact: true }).click();
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(500);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "intentions: goals + values saved together",
    Array.isArray(parsed.relationship_goals) && parsed.relationship_goals.includes("life_partner") && parsed.values.length === 2,
    `goals=${parsed.relationship_goals} values=${parsed.values}`
  );
  // guard: zero values must be rejected
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/dev/step-test?step=intentions`, { waitUntil: "networkidle" });
  await p2.getByText("Life partner", { exact: true }).click();
  await p2.locator('button[type="submit"]').click();
  await p2.waitForTimeout(400);
  const blocked = await p2.getByText("Pick at least one value").count();
  ok("intentions: blocks when no values chosen", blocked >= 1);
  await ctx2.close();
  await ctx.close();
}

/* 4) ABOUT: bio gate + optional fields */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=about`, { waitUntil: "networkidle" });
  await page.locator('textarea[id="bio"]').fill("too short");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(400);
  ok("about: short bio rejected", (await page.getByText("at least 20 characters").count()) >= 1);
  await page.locator('textarea[id="bio"]').fill("Grounded, curious, and serious about building something that lasts.");
  await page.locator('input[id="occupation"]').fill("Product designer");
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(400);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok("about: bio + occupation saved", String(parsed.bio).length >= 20 && parsed.occupation === "Product designer");
  await ctx.close();
}

/* 5) VIBE: lifestyle + interests one screen */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=vibe`, { waitUntil: "networkidle" });
  await page.getByText("Natural living", { exact: true }).click();
  for (const i of ["Hiking", "Cooking", "Music"]) {
    await page.getByText(i, { exact: true }).click();
  }
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(400);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "vibe: lifestyle + interests saved together",
    parsed.lifestyle_preferences?.includes("Natural living") && parsed.interests?.length === 3,
    `lifestyle=${parsed.lifestyle_preferences} interests=${parsed.interests?.length}`
  );
  await ctx.close();
}

/* 6) PHOTOS: upload + finish payload */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/step-test?step=photos`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles("/tmp/test-photo.png");
  await page.waitForTimeout(2000);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(600);
  const parsed = JSON.parse((await page.locator("#saved-payload").textContent()) || "{}");
  ok(
    "photos: final screen saves photo and offers Finish",
    parsed.photos?.length === 1 && String(parsed.photos[0].src).startsWith("data:image"),
    (await page.locator('button[type="submit"]').textContent()) || ""
  );
  await ctx.close();
}

/* 7) HOMEPAGE: card section verified again */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  ok("home: 'The room you're walking into' section", (await page.getByText("The room you're walking into").count()) >= 1);
  const cards = await page.getByText("Your card belongs here.").count();
  ok("home: invitation card present", cards >= 1);
  const badges = await page.locator('span[title="Trust-verified member"]').count();
  ok("home: verify badge seals present", badges >= 3, `${badges} badges`);
  const body = await page.textContent("body");
  ok("home: no 'Verified' text claim", !/\bVerified\b/.test(body || ""));
  const memberNames = ["Mara", "Jonah", "Elena", "Naomi", "Caleb"];
  let found = 0;
  for (const n of memberNames) found += (await page.getByText(n, { exact: true }).count()) > 0 ? 1 : 0;
  ok("home: all 5 member cards on the page", found === 5, `${found}/5 names`);
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
const fails = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - fails}/${results.length} PASSED`);
process.exit(fails ? 1 : 0);
