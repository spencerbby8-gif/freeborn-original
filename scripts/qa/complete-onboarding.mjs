/**
 * complete-onboarding.mjs — finish onboarding for a QA member using the app's
 * OWN endpoints (POST /api/onboarding per step, then /api/onboarding/complete),
 * with the same payload shapes the UI posts. Owner-authorised QA account.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "https://freeborn-5xwktk71i-spencerbby8-5225s-projects.vercel.app";
const REF = process.env.SUPABASE_REF || "paskturljojjopxhnrik";
const [EMAIL, PASSWORD] = readFileSync("/home/user/freeborn-audit/.secrets/preview-qa-account", "utf8").trim().split("\n");
const ANON = readFileSync("/home/user/freeborn-audit/.secrets/preview-anon-key", "utf8").trim();

const g = await fetch(`https://${REF}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const ses = await g.json();
if (!ses.access_token) { console.log("no session", JSON.stringify(ses).slice(0, 150)); process.exit(2); }
const H = { Authorization: `Bearer ${ses.access_token}`, "Content-Type": "application/json" };

// A real portrait from the site's own design samples, as a data URL.
const img = await fetch(`${BASE}/images/samples/mara.jpg`);
const buf = Buffer.from(await img.arrayBuffer());
const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
console.log("photo bytes:", buf.length);

const steps = [
  ["identity", { display_name: "Qa", birth_date: "1990-04-04", gender: "woman" }],
  ["location", { city: "Austin", region: "TX", country_code: "US", location_source: "manual" }],
  ["relationship_intent", { relationship_goals: ["long_term"], values: ["Honesty", "Community"] }],
  ["bio", { bio: "QA member exploring Freeborn. I value honest conversation, slow mornings, and building things that last.", occupation: "Designer" }],
  ["interests", { lifestyle_preferences: ["Natural wellness", "Outdoorsy"], interests: ["Hiking", "Cooking", "Reading"] }],
  ["photos", { photos: [{ id: "qa-p1", src: dataUrl, isCover: true }] }],
];

for (const [step, patch] of steps) {
  const r = await fetch(`${BASE}/api/onboarding`, { method: "POST", headers: H, body: JSON.stringify({ step, patch }) });
  const j = await r.json().catch(() => null);
  console.log(`step ${step}: ${r.status}`, r.ok ? "" : JSON.stringify(j).slice(0, 160));
}

const c = await fetch(`${BASE}/api/onboarding/complete`, { method: "POST", headers: H, body: "" });
const cj = await c.json().catch(() => null);
console.log("complete:", c.status, JSON.stringify(cj).slice(0, 200));

const s = await fetch(`${BASE}/api/onboarding/state`, { headers: H });
console.log("state now:", s.status, (await s.text()).slice(0, 120));
