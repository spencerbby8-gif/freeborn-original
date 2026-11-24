/** IndexNow notifies participating engines of PUBLIC editorial URL changes.
 * Receipt is not crawling, indexing or ranking proof. Google is not a participant.
 * Never submit private profiles, chats, health data or unchanged URLs repeatedly.
 * --dry-run prints the editorial URL inventory without sending anything.
 * --submit --path=/terms [--path=/privacy] sends explicitly changed editorial paths.
 * Account ownership in engine consoles remains a separate operator step.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteSrc = readFileSync(path.join(here, "../../src/lib/site.ts"), "utf8");
const block = /export const INDEXABLE_PATHS = \[([\s\S]*?)\];/.exec(siteSrc);
if (!block) throw new Error("INDEXABLE_PATHS not found in src/lib/site.ts");
const paths = [...block[1].matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
if (paths.length === 0) throw new Error("INDEXABLE_PATHS parsed empty");

const SITE_URL = /export const SITE_URL = "([^"]+)"/.exec(siteSrc)?.[1];
if (!SITE_URL) throw new Error("SITE_URL not found in src/lib/site.ts");

const publicDir = path.join(here, "../../public");
import { readdirSync } from "node:fs";
const keyName = readdirSync(publicDir).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyName) throw new Error("no 32-hex IndexNow key file in public/");
const key = keyName.replace(/\.txt$/, "");
const keyLocation = `${SITE_URL}/${keyName}`;
const changed = process.argv.filter(arg => arg.startsWith("--path=")).map(arg => arg.slice(7));
if (changed.some(p => !paths.includes(p))) throw new Error("Only known public editorial paths may be submitted");
const selected = changed.length ? [...new Set(changed)] : paths;
const urlList = selected.map((p) => `${SITE_URL}${p === "/" ? "/" : p}`);

const body = {
  host: SITE_URL.replace(/^https?:\/\//, ""),
  key,
  keyLocation,
  urlList,
};

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

if (!process.argv.includes("--submit") || changed.length === 0) {
  throw new Error("Explicit --submit and at least one changed --path=/public-path required; use --dry-run to inspect without sending");
}
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  signal: AbortSignal.timeout(25_000),
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`IndexNow ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
console.log(`notified ${urlList.length} changed URLs; receipt is not proof of crawling, indexing or ranking`);
/* 200 = ok, 202 = accepted for processing. Anything else is a real failure:
   400 bad payload, 403 key not fetchable, 422 url/key mismatch. */
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
