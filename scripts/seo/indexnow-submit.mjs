/**
 * indexnow-submit.mjs — push Freeborn's indexable URLs to every search engine
 * that speaks IndexNow, with no account and no gatekeeper.
 *
 * WHY THIS EXISTS (B15, 2026-11-16). Reverse-engineering the platforms' own
 * crawler-facing HTML per engine showed the giants GATE: TikTok serves Googlebot
 * the full page, Twitterbot a 6KB og-only card, Bingbot and YandexBot a bare 403,
 * and every other engine an empty client shell; Facebook reserves hreflang for
 * Googlebot alone. That is a defensive posture for brands with overwhelming
 * search demand. A site that wants to be findable on EVERY engine does the
 * opposite — serve identical rich markup to every bot (Freeborn SSRs it already)
 * and push URL changes through an engine-neutral channel.
 *
 * IndexNow (https://www.indexnow.org) is that channel: one HTTPS POST, keyed by
 * a file the site hosts at a public URL, and the participating engines queue the
 * URLs for crawling. Consumers include Microsoft Bing (which also powers Yahoo,
 * DuckDuckGo's web results and Ecosia), Yandex, Seznam.cz, Naver and Yep — i.e.
 * most of the non-Google search surface on earth. Google is not a consumer; it
 * is covered separately by Search Console + the sitemap.
 *
 * The URL list is parsed out of INDEXABLE_PATHS in src/lib/site.ts so this script
 * can never drift from the sitemap: same source of truth, same five routes.
 * The key file is public/<key>.txt, committed, and pinned by harness section [32].
 *
 * Usage: node scripts/seo/indexnow-submit.mjs [--dry-run]
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
const urlList = paths.map((p) => `${SITE_URL}${p === "/" ? "/" : p}`);

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

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`IndexNow ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
console.log(`submitted ${urlList.length} urls via key ${keyName}`);
/* 200 = ok, 202 = accepted for processing. Anything else is a real failure:
   400 bad payload, 403 key not fetchable, 422 url/key mismatch. */
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
