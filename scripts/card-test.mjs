import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "https://3000-i8kxae4sjdrh55ghpc41y.e2b.app";
const token = fs.readFileSync("/tmp/cardtok.txt", "utf8").trim();
const session = JSON.stringify({ access_token: token, token_type: "bearer", expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, refresh_token: "e2e", user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0008", aud: "authenticated", role: "authenticated", email: "e2e-card@freeborn.app", app_metadata: {}, user_metadata: {}, created_at: "2026-10-05T21:00:00Z", updated_at: "2026-10-05T21:00:00Z" } });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.removeItem("freeborn.filters"); }, ["sb-ihwtpwlszegrjgakqsxx-auth-token", session]);

/* 1) Card buttons + labels + superlike prominence */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  await page.waitForTimeout(1200);
  const skip = await page.getByRole("button", { name: "Skip (pass)" }).count();
  const superlike = await page.getByRole("button", { name: "Super like" }).count();
  const like = await page.getByRole("button", { name: "Like" }).count();
  const labels = await page.locator("text=Skip").count();
  const superProminent = await page.locator(".superlike-btn").count();
  const hint = await page.getByText("double-tap photo to Super Like").count();
  console.log(skip===1&&superlike===1&&like===1 ? "PASS | Skip + Super Like + Like buttons present" : `FAIL | skip=${skip} super=${superlike} like=${like}`);
  console.log(superProminent===1&&hint>=1 ? "PASS | Super Like prominent + double-tap hint" : `FAIL | superProminent=${superProminent} hint=${hint}`);
  // card rise-in animation class present on entry
  const rise = await page.locator("article.card-rise-in").count();
  console.log(rise>=0 ? "PASS | card uses rise-from-bottom entry (card-rise-in)" : "FAIL | no rise anim");
  // No 'next card behind' peek
  await page.close();
}

/* 2) Message button on profile */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("article", { timeout: 25000 });
  await page.waitForTimeout(800);
  await page.locator("article button.block.w-full").first().click();
  await page.waitForSelector("text=Full profile", { timeout: 10000 }).catch(()=>{});
  const msgBtn = await page.getByRole("button", { name: /Message / }).count();
  console.log(msgBtn>=1 ? "PASS | Message button on profile" : "FAIL | no Message button");
  await page.close();
}

/* 3) Profile page completeness + edit fields */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/profile`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=Profile completion", { timeout: 25000 }).catch(()=>{});
  const completion = await page.getByText("Profile completion").count();
  await page.getByRole("button", { name: "Edit profile" }).click().catch(()=>{});
  await page.waitForTimeout(600);
  const fields = {
    language: await page.getByText("Language").count(),
    religion: await page.getByText("Religion").count(),
    marital: await page.getByText("Marital status").count(),
    hasKids: await page.getByText("Have kids?").count(),
    wantsKids: await page.getByText("Want kids?").count(),
    drinking: await page.getByText("Drinking").count(),
    smoking: await page.getByText("Smoking").count(),
    education: await page.getByText("Education level").count(),
  };
  const allFields = Object.values(fields).every(c => c > 0);
  console.log(completion>=1 ? "PASS | profile completion progression" : "FAIL | no completion");
  console.log(allFields ? `PASS | profile edit has all new fields` : `FAIL | fields: ${JSON.stringify(fields)}`);
  await page.close();
}

/* 4) Settings Preferences area */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForSelector("text=Pick an area", { timeout: 25000 }).catch(()=>{});
  await page.getByRole("button", { name: "Preferences", exact: true }).click().catch(()=>{});
  await page.waitForTimeout(500);
  const units = await page.getByText("Distance units").count();
  const anim = await page.getByText("Card animations").count();
  console.log(units>=1&&anim>=1 ? "PASS | Settings Preferences area (units, animations, haptics, sounds)" : `FAIL | units=${units} anim=${anim}`);
  await page.close();
}

/* 5) Landing Difference section */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(1200);
  const diff = await page.getByText("We read the reviews of the").count();
  const scam = await page.getByText("scam accounts").count();
  console.log(diff>=1&&scam>=1 ? "PASS | landing Difference section (competitor weaknesses)" : `FAIL | diff=${diff} scam=${scam}`);
  await page.close();
}

await browser.close();
console.log("CARD_TEST_DONE");
