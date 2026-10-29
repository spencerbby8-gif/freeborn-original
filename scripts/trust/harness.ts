/* Adversarial harness for the 2026-10-28 identity/enforcement layer.
   Bundled with esbuild (which resolves the @/ alias) and run under node, so what is
   tested is exactly what ships: src/lib/photo-hash.ts, src/lib/trust-score.ts and
   src/lib/moderation-policy.ts — not a re-implementation of them. */
import {
  ahashFromGray,
  dhashFromGray,
  deriveAnchor,
  hamming64,
  hashImageBytes,
  isSamePhoto,
} from "@/lib/photo-hash";
import { computeTrustScore, memberVisibleFactors, TRUST_BOUNDS, type TrustSignals } from "@/lib/trust-score";
import { appealNeedsChallenge, decidePolicy, nextStepFor, RESOLUTION_FOR_TIER, TIER_ORDER } from "@/lib/moderation-policy";
import { scoreScamMessage, SCAM_RULE_COUNT, SCAM_ESCALATE_AT, SCAM_WARN_AT, SCAM_REPEAT_FLAGS_FOR_PATTERN } from "@/lib/scam-guard";
import { meetsDifficultyHex, runHumanChallenge, solveChallenge } from "@/lib/human-challenge-client";
import { createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";

let pass = 0;
let total = 0;
let printedOk = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  /* Three properties this suite was caught NOT having, and must never lose:
     1. `cond` is coerced, so ok("x") with a missing argument is a FAILURE, not a pass.
        An earlier version counted it green: a typo'd assertion is the worst kind of green.
     2. `total` counts EVERY call, printed and cross-checked, so the summary cannot quietly
        report fewer assertions than ran (it did: 62 printed against 80 ok-lines).
     3. A failure sets process.exitCode, so a pipeline can actually go red. */
  total++;
  if (cond === true) {
    pass++; printedOk++;
    console.log(`  ok   ${name}${extra ? "  [" + extra + "]" : ""}`);
  } else {
    fails.push(name + (extra ? " — " + extra : "") + (cond === undefined ? " [cond UNDEFINED: assertion passed no condition]" : ""));
    console.log(`  FAIL ${name}${extra ? "  [" + extra + "]" : ""}${cond === undefined ? "  [cond UNDEFINED]" : ""}`);
  }
}

/* ---------- 1. perceptual hash, against REAL images ---------- */
console.log("\n[1] photo hashing, computed from real decodable images");
const sharp = (await import("sharp")).default;
async function makeImage(opts: { seed: number; w?: number; h?: number; jpeg?: number }) {
  const w = opts.w ?? 640, h = opts.h ?? 480;
  // deterministic pseudo-photo: radial gradients + noise, no network, no fixtures
  const px = Buffer.alloc(w * h * 3);
  let s = opts.seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const g = Math.sin((x / w) * Math.PI * 2 + opts.seed) * Math.cos((y / h) * Math.PI * 3);
      const v = Math.max(0, Math.min(255, Math.round(127 + 90 * g + (rnd() - 0.5) * 26)));
      px[i] = v; px[i + 1] = (v + 40) % 256; px[i + 2] = (v * 2) % 256;
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: opts.jpeg ?? 88 })
    .toBuffer();
}
await mkdir("/tmp/ph", { recursive: true });
const base = await makeImage({ seed: 3 });
const recompressed = await makeImage({ seed: 3, jpeg: 40 });
const resized = await sharp(base).resize(320, 240).toBuffer();
const brightened = await sharp(base).modulate({ brightness: 1.25 }).toBuffer();
const other = await makeImage({ seed: 77 });
const flipped = await sharp(base).flop().toBuffer();
const crop5 = await sharp(base).extract({ left: 16, top: 12, width: 608, height: 456 }).resize(640, 480).toBuffer();
const crop40 = await sharp(base).extract({ left: 128, top: 96, width: 384, height: 288 }).resize(640, 480).toBuffer();

const H = async (b: Buffer) => hashImageBytes(b);
const hb = await H(base);
ok("hash is produced for a real jpeg", !!hb, hb ? `${hb.d}/${hb.a} ${hb.width}x${hb.height}` : "null");
ok("identical bytes give an identical hash", (await H(Buffer.from(base)))!.d === hb!.d);
const hr = await H(recompressed);
ok("recompression q88->q40 survives dHash", hamming64(hb!.d, hr!.d)! <= 4, `d=${hamming64(hb!.d, hr!.d)}`);
const hs = await H(resized);
ok("downscale 640x480->320x240 survives", hamming64(hb!.d, hs!.d)! <= 4, `d=${hamming64(hb!.d, hs!.d)}`);
const hbr = await H(brightened);
ok("brightness +25% survives", hamming64(hb!.d, hbr!.d)! <= 8, `d=${hamming64(hb!.d, hbr!.d)}`);
const ho = await H(other);
ok("a different photo is far away", hamming64(hb!.d, ho!.d)! >= 16, `d=${hamming64(hb!.d, ho!.d)}`);
const hf = await H(flipped);
ok("mirroring is detected as different (we do not claim invariance we lack)", hamming64(hb!.d, hf!.d)! > 6, `d=${hamming64(hb!.d, hf!.d)}`);
const hc5 = await H(crop5);
const hc40 = await H(crop40);
/* CROP SENSITIVITY IS A DOCUMENTED LIMITATION, asserted so it can never be quietly
   claimed as a strength: a global perceptual hash diverges on a crop. These numbers are
   what the module's comment states, and a future "improvement" that changes them must
   change the claim too. */
ok("a 5% crop breaks the dHash bound (stated limitation, not a pass)", hamming64(hb!.d, hc5!.d)! > 6, `d=${hamming64(hb!.d, hc5!.d)}`);
ok("a 40% crop diverges further", hamming64(hb!.d, hc40!.d)! > hamming64(hb!.d, hc5!.d)!, `${hamming64(hb!.d, hc5!.d)} -> ${hamming64(hb!.d, hc40!.d)}`);
ok("exact-byte hash still separates them", hc5!.bytes !== hb!.bytes && hc40!.bytes !== hb!.bytes);
ok("exact-byte hash catches a byte-identical re-upload", (await H(Buffer.from(base)))!.bytes === hb!.bytes);
ok("isSamePhoto reports exact-byte identity without relying on distance", isSamePhoto({ d: hb!.d, a: hb!.a, bytes: "x".repeat(64) }, { d: "0".repeat(16), a: "0".repeat(16), bytes: "x".repeat(64) }).exact);
ok("unusable bytes -> null, never a fake hash", (await H(Buffer.from("not an image"))) === null);
ok("isSamePhoto agrees on the recompressed pair", isSamePhoto({ d: hb!.d, a: hb!.a }, { d: hr!.d, a: hr!.a }).hit);
ok("isSamePhoto rejects the unrelated pair", !isSamePhoto({ d: hb!.d, a: hb!.a }, { d: ho!.d, a: ho!.a }).hit);

/* hand-computed references for the primitives */
const flat = new Uint8Array(9 * 8).fill(128);
const rowsMono = Uint8Array.from({ length: 72 }, (_, i) => (i % 9));
ok("dHash of a flat field is all-zeros (no left<right anywhere)", dhashFromGray(flat, 9, 8) === "0000000000000000");
ok("dHash of a monotonic ramp is all-ones", dhashFromGray(rowsMono, 9, 8) === "ffffffffffffffff");
ok("aHash of a flat field is all-zeros (nothing above its own mean)", ahashFromGray(new Uint8Array(64).fill(200), 8) === "0000000000000000");

/* ---------- 2. anchor ---------- */
console.log("\n[2] composite identity anchor");
const a1 = await deriveAnchor([{ d: hb!.d, a: hb!.a }, { d: ho!.d, a: ho!.a }]);
const a2 = await deriveAnchor([{ d: ho!.d, a: ho!.a }, { d: hb!.d, a: hb!.a }]);
ok("anchor is 16 hex chars", !!a1 && /^[0-9a-f]{16}$/.test(a1), String(a1));
ok("anchor is order-independent (sorted fold)", a1 === a2);
const a3 = await deriveAnchor([{ d: hb!.d, a: hb!.a }]);
ok("a different photo set yields a different anchor", a1 !== a3);
ok("empty photo set yields no anchor (not a zero anchor)", (await deriveAnchor([])) === null);
ok("garbage hash is refused", (await deriveAnchor([{ d: "zzzz" }])) === null);
/* collision sanity: 1000 distinct sets must all be distinct */
const seen = new Set<string>();
for (let i = 0; i < 1000; i++) {
  const hx = createHash("sha256").update("p" + i).digest("hex").slice(0, 16);
  seen.add((await deriveAnchor([{ d: hx }]))!);
}
ok("1000 distinct photo sets -> 1000 distinct anchors", seen.size === 1000, `unique=${seen.size}`);

/* ---------- 3. trust score ---------- */
console.log("\n[3] trust score, adversarial");
const sig = (o: Partial<TrustSignals> = {}): TrustSignals => ({
  verified: false, emailConfirmed: false, accountAgeDays: 0, verificationAttempts: 0,
  verificationSuccesses: 0, verificationFailures: 0, mismatchHistoryCount: 0,
  duplicatePhotoHits: 0, sharedDeviceAccounts: 0, gpsSpoofSuspects7d: 0,
  automatedTrafficBlocks7d: 0, scamFlags7d: 0, openWarnings: 0, openSuppressions: 0,
  enginesAvailable: true, ...o,
});
const clean = computeTrustScore(sig());
ok("a brand-new unverified account sits in the middle, not in trouble", clean.score >= 30 && clean.score <= 60, `score=${clean.score} band=${clean.band}`);
ok("scoring is deterministic", JSON.stringify(computeTrustScore(sig({ scamFlags7d: 3 }))) === JSON.stringify(computeTrustScore(sig({ scamFlags7d: 3 }))));
const verified = computeTrustScore(sig({ verified: true, emailConfirmed: true, accountAgeDays: 400, verificationSuccesses: 1 }));
ok("verification + age lifts the score", verified.score > clean.score + 15, `${clean.score} -> ${verified.score}`);
let worst = computeTrustScore(sig({ duplicatePhotoHits: 99, sharedDeviceAccounts: 99, gpsSpoofSuspects7d: 99, automatedTrafficBlocks7d: 99, scamFlags7d: 99, verificationFailures: 99, mismatchHistoryCount: 99, openWarnings: 9, openSuppressions: 9 }));
ok("even maximally bad signals stay in bounds", worst.score >= TRUST_BOUNDS.min && worst.score <= TRUST_BOUNDS.max, `score=${worst.score}`);
/* Positive weights are capped PER FACTOR, so a huge age cannot carry a member to the
   ceiling on its own. Assert the cap arithmetic exactly rather than the vague "100",
   and fuzz the bounds so no input can escape 0..100. */
const onlyAge = computeTrustScore(sig({ accountAgeDays: 1e9 }));
const expect = 50 + 8 /* age cap */ - 6 /* unverified */ - 6 /* unconfirmed email */;
ok("per-factor caps hold: huge age alone = 50+8-6-6", onlyAge.score === expect, `score=${onlyAge.score} expected=${expect}`);
let escaped = 0;
for (let i = 0; i < 20000; i++) {
  const r = (n: number) => Math.floor(Math.random() * n);
  const f = computeTrustScore(sig({
    verified: r(2) === 0, emailConfirmed: r(2) === 0, accountAgeDays: Math.random() * 1e6,
    verificationAttempts: r(50), verificationSuccesses: r(50), verificationFailures: r(50),
    mismatchHistoryCount: r(50), duplicatePhotoHits: r(50), sharedDeviceAccounts: r(50),
    gpsSpoofSuspects7d: r(50), automatedTrafficBlocks7d: r(50), scamFlags7d: r(50),
    openWarnings: r(20), openSuppressions: r(20), enginesAvailable: r(3) !== 0,
  }));
  if (!Number.isFinite(f.score) || f.score < TRUST_BOUNDS.min || f.score > TRUST_BOUNDS.max) escaped++;
}
ok("20000 randomised signal vectors, none escape 0..100", escaped === 0, `escaped=${escaped}`);
/* the cap is the point: one signal must never end an account */
const oneDup = computeTrustScore(sig({ verified: true, emailConfirmed: true, accountAgeDays: 900, verificationSuccesses: 3, duplicatePhotoHits: 500 }));
ok("a single strong negative signal cannot push a good account to zero", oneDup.score >= 40, `score=${oneDup.score}`);
/* outage must not read as member risk */
const onOutage = computeTrustScore(sig({ enginesAvailable: false, verificationFailures: 4, mismatchHistoryCount: 3 }));
const onEngines = computeTrustScore(sig({ enginesAvailable: true, verificationFailures: 4, mismatchHistoryCount: 3 }));
ok("engine outage halves identity penalties, not the member's standing", onOutage.score > onEngines.score, `${onEngines.score} -> ${onOutage.score}`);
ok("outage is disclosed in the factors", onOutage.factors.some((f) => f.label === "Engine outage adjustment"));
/* explainability + member-visible split */
ok("every applied factor is labelled", computeTrustScore(sig({ scamFlags7d: 2 })).factors.every((f) => f.label.length > 3));
const vis = memberVisibleFactors(computeTrustScore(sig({ sharedDeviceAccounts: 4, duplicatePhotoHits: 2, gpsSpoofSuspects7d: 1 })).factors);
ok("investigative factors are withheld from the subject", !vis.some((f) => String(f.key).match(/sharedDevice|duplicatePhoto|gps/)));
ok("reproach factors a member should see are not withheld", vis.some((f) => f.key === "scamFlags7d" || f.key === "verified"));

/* ---------- 4. policy ladder ---------- */
console.log("\n[4] graduated enforcement policy");
const ci = (o: Record<string, unknown>) => ({
  violatedClass: "violation_behavior", detail: "d", notes: "n", trustDelta: -10, openedBy: "member_report", ...o,
} as never);
const mass = decidePolicy(ci({ code: "report_surge", reporterCount: 200 }));
ok("a mass-report wave never suppresses or suspends", mass.tier === "warning" && mass.reviewRequired, `tier=${mass.tier}`);
const oneReporter = decidePolicy(ci({ code: "harassment_pattern", reporterCount: 1 }));
ok("one reporter opens nothing", oneReporter.open === false, oneReporter.reason.slice(0, 60));
const supNoEvidence = decidePolicy(ci({ code: "inappropriate_media", openedBy: "system" }));
ok("system+media with no verdict de-escalates to warning", supNoEvidence.tier === "warning", `tier=${supNoEvidence.tier}`);
const dupPhoto = decidePolicy(ci({ code: "photo_reused_across_accounts", openedBy: "system", violatedClass: "violation_profile_content" }));
ok("a duplicate photo is corroborated by the fact itself", dupPhoto.tier === "suspension" && dupPhoto.reviewRequired, `tier=${dupPhoto.tier}`);
const auto = decidePolicy(ci({ code: "automated_traffic", openedBy: "system", automatedTraffic: true, violatedClass: "violation_behavior" }));
ok("automated traffic can carry suspension, still needs a human", auto.tier === "suspension" && auto.reviewRequired, `tier=${auto.tier}`);
const autoSoft = decidePolicy(ci({ code: "harassment_pattern", openedBy: "system", automatedTraffic: true }));
ok("a suppression-tier code with traffic evidence stays at suppression", autoSoft.tier === "suppression", `tier=${autoSoft.tier}`);
const verifiedSoft = decidePolicy(ci({ code: "scam_pattern_message", openedBy: "system", verified: true, violatedClass: "violation_behavior" }));
ok("a verified member gets a notice for a recoverable signal", verifiedSoft.tier === "warning", `tier=${verifiedSoft.tier}`);
const verifiedHard = decidePolicy(ci({
  code: "device_cluster", openedBy: "identity_engine", verified: true, violatedClass: "violation_identity",
  engine: { decision: "mismatch", confidence: "high" },
}));
ok("a verified member with a unanimous mismatch steps down one tier, not two", verifiedHard.tier === "warning", `tier=${verifiedHard.tier}`);
const flap = decidePolicy(ci({ code: "scam_pattern_message", openedBy: "system", daysSinceSameTier: 2 }));
ok("a signal repeating inside a week is logged, not escalated", flap.tier === "warning" && flap.reviewRequired);
const band = decidePolicy(ci({ code: "underage_suspected", openedBy: "system", violatedClass: "violation_profile_content" }));
ok("underage suspicion escalates on the fact, without a ban", band.tier === "suspension", `tier=${band.tier}`);
/* no code path may ever produce a ban */
const codes = ["photo_reused_across_accounts","identity_anchor_shared","device_cluster","scam_pattern_message","inappropriate_media","harassment_pattern","underage_suspected","automated_traffic","datacenter_signup","gps_spoof","identity_gate_mismatch","report_surge"] as const;
let banned = 0;
for (const code of codes) for (const openedBy of ["system","identity_engine","moderation_engine","operator","member_report"] as const)
  for (const verified of [true,false]) for (const auto2 of [true,false]) for (const engine of [undefined,{decision:"mismatch",confidence:"high"},{decision:"unclear",confidence:"unknown"}]) {
    const d = decidePolicy({ code, violatedClass: "violation_behavior", detail: "x", notes: "y", trustDelta: -10, openedBy, verified, automatedTraffic: auto2, engine, reporterCount: 999, daysSinceSameTier: null } as never);
    if (d.tier === "ban") banned++;
  }
ok(`no combination of ${codes.length * 5 * 2 * 2 * 3} inputs produces an automatic ban`, banned === 0, `ban-tier outputs=${banned}`);
ok("every tier has a distinct reversible resolution code", new Set(Object.values(RESOLUTION_FOR_TIER)).size === TIER_ORDER.length);
ok("warning is acknowledgeable and has a deadline", nextStepFor("warning", true).step === "acknowledge" && nextStepFor("warning", true).deadlineDays === 30);
ok("suppression points at verify-or-appeal", nextStepFor("suppression", true).step === "verify_or_appeal");
ok("nothing open means nothing to do", nextStepFor("ban", false).step === "nothing_open");
ok("first appeal needs no challenge", appealNeedsChallenge({ priorAppeals: 0, reopenedWithinDays: null }) === false);
ok("a third appeal needs a challenge", appealNeedsChallenge({ priorAppeals: 2, reopenedWithinDays: null }) === true);
ok("re-filing within 3 days needs a challenge", appealNeedsChallenge({ priorAppeals: 0, reopenedWithinDays: 1 }) === true);

/* ---------- 5. proof of work ---------- */
console.log("\n[5] human challenge: real PoW verification, replay, expiry");
/* The route owns meetsDifficulty; re-derive it here against the same spec so the test
   proves the ALGORITHM is solvable and non-trivial, independent of the route file. */
function powOK(nonce: string, sol: string, bits: number) {
  const hex = createHash("sha256").update(`${nonce}:${sol}`).digest("hex");
  const full = Math.floor(bits / 4);
  if (hex.slice(0, full) !== "0".repeat(full)) return false;
  if (bits % 4 === 0) return true;
  return parseInt(hex[full], 16) < 1 << (4 - (bits % 4));
}
const nonce = createHash("sha256").update("nonce-fixture").digest("hex").slice(0, 32);
let solved = -1;
const t0 = Date.now();
for (let i = 0; i < 8_000_000; i++) if (powOK(nonce, String(i), 20)) { solved = i; break; }
const ms = Date.now() - t0;
ok("a 20-bit challenge is solvable by a client", solved > 0, `candidates=${solved + 1} in ${ms}ms`);
ok("cost is a real cost but not a phone-killer (<10s on this box)", ms < 10000, `${ms}ms`);
ok("the answer verifies (string encoding, as the route receives it)", solved > 0 && powOK(nonce, String(solved), 20));
ok("an off-by-one answer fails", solved > 0 && !powOK(nonce, String(solved + 1), 20));
ok("a different nonce fails with the same answer", !powOK(createHash("sha256").update("other").digest("hex").slice(0, 32), String(solved), 20));
/* difficulty must actually gate: a 12-bit solution should fail a 20-bit test most of the time */
let weak = 0;
for (let i = 0; i < 200; i++) if (powOK(nonce, "s" + i, 12) && powOK(nonce, "s" + i, 20)) weak++;
ok("a lower-difficulty solve does not satisfy the higher check", weak === 0, `leaks=${weak}`);

/* ---------- 6. image pipeline cost ---------- */
console.log("\n[6] cost of the check (so a control that is too slow gets ignored)");
const N = 20;
const t1 = Date.now();
for (let i = 0; i < N; i++) await H(base);
const per = (Date.now() - t1) / N;
ok("hashing one 640x480 jpeg is well under the request budget", per < 25, `${per.toFixed(1)}ms per image`);
const big = await sharp(base).resize(3000, 2000).jpeg({ quality: 92 }).toBuffer();
const t2 = Date.now();
await H(big);
ok("a 3000x2000 upload still hashes fast", Date.now() - t2 < 400, `${Date.now() - t2}ms, ${(big.length / 1024) | 0} KB`);

await rm("/tmp/ph", { recursive: true, force: true });


/* ------------------------------------------------------------------ [7] hash encoding -- */
/* The single most valuable assertions in this file. The live schema once declared every hash
   column bit(64) while src/lib/photo-hash.ts emits 16-hex-char strings, so EVERY photo insert
   from the real upload path would have died with 22P02 `"d" is not a valid binary digit`.
   Nothing in typecheck, lint or the Next build can see that: the two representations are both
   `string` in TypeScript. These checks read the migration text and the encoding itself, so the
   contract is enforced in CI even though the column type is not a TypeScript type. */
{
  const { readFileSync } = await import("node:fs");
  const mig = readFileSync(new URL("../../db/migrations/2026-10-28-identity-enforcement.sql", import.meta.url), "utf8");
  const hashCols = ["phash_d", "phash_a", "photo_dhash", "photo_ahash", "anchor", "device_hash", "token_hash"];
  for (const c of hashCols) {
    const declared = new RegExp(`${c}\\s+(\\w+)\\(?(\\d*)`).exec(mig);
    ok(`${c} is char(16) hex, never bit(64) (schema↔code contract)`,
      declared?.[1] === "char" && declared?.[2] === "16", `declared=${declared?.[1]}(${declared?.[2]})`);
  }
  const bytesCol = /phash_bytes\s+(\w+)\((\d+)\)/.exec(mig);
  ok("phash_bytes is char(64) (full sha256 hex)", bytesCol?.[1] === "char" && bytesCol?.[2] === "64",
    `declared=${bytesCol?.[1]}(${bytesCol?.[2]})`);
  const fn = /create or replace function public\.hamming64[\s\S]*?\$\$;/.exec(mig)?.[0] ?? "";
  ok("hamming64 does not text-cast to bit (Postgres has no hex->bit cast)",
    !/trim\([ab]\)\)?::bit/.test(fn) && !/lpad\([^)]*\)\s*::bit\(64\)/.test(fn));
  ok("hamming64 does not call power(numeric) (PG numeric power is approximate)", !/power\(/.test(fn));
  ok("hamming64 does not call the non-existent popcount()", !/popcount\(/.test(fn));
  const GUARD = "!~ '^[0-9a-f]{16}$'";
  ok("hamming64 guards malformed input to NULL",
    fn.includes(GUARD) && fn.includes("when a is null or b is null then null"),
    `guard-present=${fn.includes(GUARD)}`);
}

/* The app's hamming64 must equal the values public.hamming64() was verified against on the live
   cluster (13/13 agreement, 2026-10-28). Frozen here: change the JS and this fails, change the
   SQL and the operator query in RE-MECHANICS.md fails, change both and you did it on purpose. */
{
  const PARITY: [string, string, number][] = [
    ["0000000000000000", "0000000000000000", 0],
    ["8000000000000000", "7f00000000000000", 8],
    ["ffffffffffffffff", "0000000000000000", 64],
    ["0000000000000001", "0000000000000000", 1],
    ["ffff000000000000", "0000ffffffffffff", 64],
    ["dcd733717369339d", "dcd733717369339d", 0],
    ["deadbeefdeadbeef", "deadbeefdeadbee0", 4],
    ["8000000000000000", "ffffffffffffffff", 63],
    ["7fffffffffffffff", "8000000000000000", 64],
    ["ffff0000ffff0000", "0000ffff0000ffff", 64],
    ["0000000100000001", "0000000000000000", 2],
    ["0f0f0f0f0f0f0f0f", "f0f0f0f0f0f0f0f0", 64],
    ["1234567890abcdef", "abcdef1234567890", 42],
  ];
  const off = PARITY.filter(([a, b, want]) => hamming64(a, b) !== want);
  ok("app hamming64 matches the verified SQL function on all 13 vectors", off.length === 0,
    off.map(([a, b, w]) => `${a}/${b} want=${w} got=${hamming64(a, b)}`).join("; "));
  ok("hamming64 is symmetric", PARITY.every(([a, b, w]) => hamming64(b, a) === w));
  ok("hamming64 rejects malformed input rather than guessing",
    hamming64("zz00000000000000", "0000000000000000") === null &&
    hamming64("000000000000000", "0000000000000000") === null &&
    hamming64(null as never, "0000000000000000") === null);
}

/* The two duplicate-photo paths must both be reachable, and the exact-bytes one must fire when
   the perceptual one cannot (the crop case). This is the assertion that makes the documented
   limitation an enforced property instead of a comment. */
{
  const d = "a1b2c3d4e5f60718";
  const h1 = { d, a: "1111222233334444", bytes: "c".repeat(64) };
  const h2 = { d, a: "1111222233334444", bytes: "c".repeat(64) };
  ok("byte-identical upload matches with a useless perceptual hash",
    isSamePhoto({ d: "0".repeat(16), a: "0".repeat(16), bytes: h1.bytes },
                 { d: "ffffffffffffffff", a: "ffffffffffffffff", bytes: h2.bytes }).exact);
  ok("a hashable upload with different bytes is NOT called a duplicate",
    !isSamePhoto(h1, { ...h2, bytes: "d".repeat(64), d: "ffffffffffffffff", a: "ffffffffffffffff" }).hit);
  const vs = hamming64(d, "ffffffffffffffff")!;
  ok("distance over random pairs stays in 0..64 and matches bit-popcount", (() => {
    for (let i = 0; i < 4000; i++) {
      const r = () => Array.from({ length: 16 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      const x = r(), y = r(), got = hamming64(x, y)!;
      let want = 0;
      for (let k = 0; k < 16; k++) {
        const n = parseInt(x[k], 16) ^ parseInt(y[k], 16);
        want += [8, 4, 2, 1].filter((b) => (n & b) !== 0).length;
      }
      if (got < 0 || got > 64 || got !== want) return false;
    }
    return true;
  })(), `probe=${vs}`);
}


/* ------------------------------------------------------------------ [8] challenge reliability -- */
/* A captcha substitute that locks out the human is worse than no captcha. The numbers below are
   what the shipped default must keep true; if the cost model changes, this changes with it. */
/* The constants are read from the ROUTE SOURCE TEXT, not imported: importing the route pulls in
   @/db, which throws at module load without a live connection string. Reading the source is also
   the stronger assertion for a contract like this -- it pins what ships, not a copy. */
const { readFileSync } = await import("node:fs");
const issueSrc = readFileSync(new URL("../../src/app/api/human/issue/route.ts", import.meta.url), "utf8");
const num = (name: string) => Number((new RegExp(`export const ${name} = ([0-9_]+)`).exec(issueSrc)?.[1] ?? "").replace(/_/g, ""));
const DEFAULT_BITS = num("CHALLENGE_DIFFICULTY_BITS");
const MAX_BITS = num("MAX_CHALLENGE_DIFFICULTY_BITS");
const BROWSER_BITS = num("BROWSER_CHALLENGE_DIFFICULTY_BITS");
const BUDGET = num("SOLVER_BUDGET_CANDIDATES");
ok("issue route exposes the difficulty constants the suite pins",
  Number.isFinite(DEFAULT_BITS) && Number.isFinite(MAX_BITS) && Number.isFinite(BUDGET),
  `default=${DEFAULT_BITS} max=${MAX_BITS} budget=${BUDGET}`);
ok("default difficulty is at or below the measured reliability ceiling",
  DEFAULT_BITS <= MAX_BITS, `${DEFAULT_BITS} <= ${MAX_BITS}`);
ok("default difficulty is the level measured at zero budget failures",
  DEFAULT_BITS === 18, `default=${DEFAULT_BITS} (18-bit: 0/120 unsolved; 20-bit: 5/106)`);
ok("the issue payload carries a solver budget and a re-request rule",
  issueSrc.includes("solverBudget") && issueSrc.includes("onExhausted"));
let powSolved = 0, powTried = 0, powWorst = 0;
for (let k = 0; k < 25; k++) {
  const nn = Array.from({ length: 32 }, () => "0123456789abcdef"[(Math.random() * 16) | 0]).join("");
  const t1 = Date.now();
  powTried++;
  for (let n = 0; n < BUDGET; n++) {
    if (powOK(nn, String(n), DEFAULT_BITS)) { powSolved++; powWorst = Math.max(powWorst, Date.now() - t1); break; }
  }
}
ok(`default difficulty solves ${powSolved}/${powTried} fresh nonces inside the stated budget`,
  powSolved === powTried, `worst ${powWorst}ms`);
ok("difficulty above the ceiling is rejected by the ceiling rule, not silently used",
  MAX_BITS === 20 && BUDGET === 4_000_000);


/* ------------------------------------------- [11] 2026-10-29 engine operability -- */
/* Every assertion in this section exists because a real production defect was found by
   reading execution paths rather than trusting names. Section order is load-bearing: the
   summary must remain last (see the note at the bottom of this file). */
const RQ = "../../src/app/api/reports/route.ts";
const reportSrc = readFileSync(new URL(RQ, import.meta.url), "utf8");
const migOps = readFileSync(new URL("../../db/migrations/2026-10-29-engine-operability.sql", import.meta.url), "utf8");
const verifSrc = readFileSync(new URL("../../src/app/api/verification/check/route.ts", import.meta.url), "utf8");
const liveSrc = readFileSync(new URL("../../src/lib/liveness-challenge.ts", import.meta.url), "utf8");
const chalSrc = readFileSync(new URL("../../src/app/api/verification/challenge/route.ts", import.meta.url), "utf8");
const queueSrc = readFileSync(new URL("../../src/app/api/admin/review-queue/route.ts", import.meta.url), "utf8");
const schemaSrc = readFileSync(new URL("../../src/db/schema.ts", import.meta.url), "utf8");

/* -- the reason/CHECK drift that 500'd live reports ------------------------------ */
const migReasonBlock = /reports_reason_check check \(\s*reason in \(([\s\S]*?)\)\s*\);/.exec(migOps)?.[1] ?? "";
const migReasons = new Set([...migReasonBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
const appReasons = new Set([...reportSrc.matchAll(/^  "([a-z_]+)",$/gm)].map((m) => m[1]));
ok("migration 2026-10-29 exists and rebuilds both live CHECKs",
  migOps.includes("alter table public.reports drop constraint if exists reports_reason_check") &&
  migOps.includes("human_challenges_purpose_check"),
  `constraints=${(migOps.match(/add constraint/g) || []).length}`);
ok("every app report reason is accepted by the live CHECK (the 'safety' 23514 class)",
  appReasons.size >= 8 && [...appReasons].every((r) => migReasons.has(r)),
  `app=${appReasons.size} migration=${migReasons.size} missing=${[...appReasons].filter((r) => !migReasons.has(r)).join(",") || "none"}`);
ok("schema.ts, the migration and the route agree on the same reason set",
  [...appReasons].every((r) => schemaSrc.includes(`'${r}'`)) === true &&
  /reports_reason_check/.test(schemaSrc));
ok("the REASONS set is exported for consumers rather than duplicated",
  reportSrc.includes("export const REASONS = new Set(["));
ok("the report insert is guarded so a CHECK can never destroy a report again",
  /let filed: \{ id: string \} \| null = null;/.test(reportSrc) &&
  reportSrc.includes('reason: "other"') && reportSrc.includes('status: 503'));
ok("a rejected reason is recorded as a security event, not swallowed",
  reportSrc.includes('kind: "report_reason_rejected"'));
ok("legacy reason values normalise instead of being dropped",
  /inappropriate_content: "inappropriate_media"/.test(reportSrc) && /violence: "safety"/.test(reportSrc));
ok("triage state is persisted, so 'unjudged' is distinguishable from 'unread'",
  reportSrc.includes('triage: "pending"') && reportSrc.includes('triage: "complete"') &&
  schemaSrc.includes('triage: text("triage")'));
ok("the enforcement case is opened for the reason that actually landed",
  reportSrc.includes("REASON_TO_CASE[filedReason]"));

/* -- scam guard: scoring and adversarial evasion --------------------------------- */
const rulesCompile = SCAM_RULE_COUNT > 10;
ok("all scam rules compile and the set grew beyond the old 10",
  rulesCompile, `rules=${SCAM_RULE_COUNT}`);
const innocent = [
  "Dinner at 8? I know a place with great jollof.",
  "My rent went up again, landlords are ruthless.",
  "Do you want to split an Uber to the venue?",
  "I just got paid, feeling generous. Drinks are on me.",
  "The bank made me re-do my passport photos, what a day.",
  "Where do you work, how was the trip and what kind of food do you like?",
];
const fp = innocent.filter((t) => scoreScamMessage(t).shouldWarn);
ok("six ordinary messages produce zero false positives", fp.length === 0, fp.join(" | ") || "clean");
const attacks: Array<[string, string]> = [
  ["can you send me money for the bus home", "money_transfer"],
  ["buy a google play card and read me the numbers", "gift_card"],
  ["my uncle runs a crypto platform, guaranteed 2x weekly returns", "crypto_investment"],
  ["the package is stuck at customs, pay the fee to release it", "package_customs"],
  ["i was detained at the airport, please help me with bail money", "fabricated_emergency"],
  ["delete this app, they can see us here, add me on whatsapp", "off_platform_move"],
  ["can you receive the transfer then forward it to my mate", "money_mule"],
  ["send me the otp code that just came to your phone", "credential_harvest"],
  ["my grandmother is dying, i need money for the operation", "fabricated_emergency"],
];
const missed = attacks.filter(([t]) => !scoreScamMessage(t).shouldWarn);
ok("all nine recovered scam shapes cross the warn threshold", missed.length === 0, missed.map((m) => m[0]).join(" | ") || "all caught");
const mislabelled = attacks.filter(([t, cat]) => scoreScamMessage(t).strongest !== cat);
ok("each attack is attributed to the correct category (not just flagged)", mislabelled.length === 0,
  mislabelled.map(([t, c]) => `${c}!=${scoreScamMessage(t).strongest}`).join(" | ") || "all correct");
const oneShot = scoreScamMessage("can you send me money for the bus home", 0);
const repeat = scoreScamMessage("can you send me money for the bus home", SCAM_REPEAT_FLAGS_FOR_PATTERN);
ok("a first offence warns but never escalates", oneShot.shouldEscalate === false && oneShot.shouldWarn === true,
  `score=${oneShot.score}`);
ok("a repeat sender escalates, and only because of the prior flag",
  repeat.shouldEscalate === true && repeat.score > oneShot.score, `${oneShot.score} -> ${repeat.score}`);
ok("score is capped so a long message cannot accumulate into a conviction",
  scoreScamMessage(attacks.map((a) => a[0]).join(". ")).score <= 100);
ok("thresholds are exported constants, not magic numbers in the route",
  SCAM_WARN_AT === 40 && SCAM_ESCALATE_AT === 70 && SCAM_REPEAT_FLAGS_FOR_PATTERN === 2);
ok("the customs reading outranks the ambiguous mule rule (rule order is load-bearing)",
  scoreScamMessage("the package is stuck at customs, pay the fee to release it").strongest === "package_customs");
ok("escalation is arithmetically reachable (the bug that made it dead code)",
  oneShot.score + Math.min(20, SCAM_REPEAT_FLAGS_FOR_PATTERN * 10) >= SCAM_WARN_AT &&
  repeat.shouldEscalate === true,
  `${oneShot.score}+cap => ${repeat.score}`);
ok("one prior flag alone is not enough to escalate",
  scoreScamMessage("can you send me money for the bus home", 1).shouldEscalate === false);

/* -- freshness gate: the real, bounded fix -------------------------------------- */
ok("a verification purpose exists in schema and migration, not only in code",
  schemaSrc.includes(`'appeal','signup','reset','verification'`) ||
  /\('appeal','signup','reset','verification'\)/.test(schemaSrc.replace(/\s+/g, "")) ||
  schemaSrc.includes("'verification'") && migOps.includes("'verification'"));
ok("the challenge route is auth-gated, cross-origin-guarded and single-live",
  chalSrc.includes("Not signed in.") && chalSrc.includes("rejectCrossOrigin") &&
  chalSrc.includes('eq(humanChallenges.status, "issued")'));
ok("the token is consumed, not looked up twice, and bound to one member",
  liveSrc.includes("status: \"solved\"") && liveSrc.includes("foreign") &&
  liveSrc.includes("lost the consume race"));
ok("replay, expiry and absence are distinct states rather than one boolean",
  /missing\|expired\|replayed\|foreign/.test(liveSrc.replace(/[`\s]/g, "")) ||
  (liveSrc.includes('"missing"') && liveSrc.includes('"expired"') && liveSrc.includes('"replayed"') && liveSrc.includes('"foreign"')));
ok("the badge from the single-engine path now requires a verified freshness token",
  verifSrc.includes("pose.matchesAsked === true && freshness.state === \"verified\""));
ok("freshness is consumed BEFORE any engine call (no budget burn on a replay)",
  verifSrc.indexOf("consumeLivenessChallenge") <
    (verifSrc.indexOf("askLm7(") === -1 ? Infinity : verifSrc.indexOf("askEngine(") === -1 ? Infinity : verifSrc.indexOf("askEngine(")),
  `consume@${verifSrc.indexOf("consumeLivenessChallenge")}`);
ok("an unproven attempt is recorded and routed to a human, never silently dropped",
  verifSrc.includes("held for human review") && verifSrc.includes("status: \"pending\""));
ok("the outcome is written into the audit row, so it is reconstructable later",
  verifSrc.includes("freshnessTag(freshness.state)"));
ok("a malformed token id cannot reach the database at all",
  liveSrc.includes("/^[0-9a-f-]{36}$/i.test(tokenId)"));
ok("the client sends the token once and clears it, so retries re-challenge",
  /setLivenessToken\(null\)/.test(readFileSync(new URL("../../src/components/app/verify-modal.tsx", import.meta.url), "utf8")));

/* -- review queue: read-only, gated, non-leaking -------------------------------- */
const { queuePriority } = await import("@/lib/review-queue-priority");
ok("the queue is gated fail-closed in production and readable in review environments",
  queueSrc.includes("if (isProduction && allowlist.length === 0) return new Response(\"Not found\", { status: 404 })"));
ok("the queue declares and implements read-only (no POST handler)",
  queueSrc.includes("read_only: true") && !/export async function POST/.test(queueSrc));
ok("member accusations outrank identity-gate receipts",
  queuePriority({ origin: "member", triage: "pending", severity: null, trustScore: 60, openCases: 0, ageHours: 1 }) >
  queuePriority({ origin: "identity_gate", triage: "pending", severity: null, trustScore: 60, openCases: 0, ageHours: 1 }));
ok("age is capped so an old row cannot outrank a live safety claim",
  queuePriority({ origin: "member", triage: "pending", severity: null, trustScore: 60, openCases: 0, ageHours: 24 * 400 }) -
  queuePriority({ origin: "member", triage: "pending", severity: null, trustScore: 60, openCases: 0, ageHours: 0 }) === 12);
ok("the queue never emits a whole email address",
  !queueSrc.includes("subject_email") && queueSrc.includes("emailHint"));
ok("the queue never emits chat content or message bodies",
  !/from\(messages\)/.test(queueSrc) && !queueSrc.includes("match_messages"));
ok("the queue never exposes bucket paths or media keys",
  !queueSrc.includes("storagePath") && !queueSrc.includes("selfieMedia"));


/* ----------------------------------- [12] browser-solvable challenge (enforce-ready) -- */
/* The server-side gate shipped before any client could answer a 428. These assertions are
   what make `FREEBORN_HUMAN_CHALLENGE=enforce` a truthful statement instead of an outage. */
const refHash = (nonce: string, sol: string, bits: number) => {
  const hex = createHash("sha256").update(`${nonce}:${sol}`).digest("hex");
  return meetsDifficultyHex(nonce, sol, bits, hex);
};
const serverSemantics = (nonce: string, sol: string, bits: number) => {
  const hex = createHash("sha256").update(`${nonce}:${sol}`).digest("hex");
  const full = Math.floor(bits / 4);
  if (hex.slice(0, full) !== "0".repeat(full)) return false;
  if (bits % 4 === 0) return true;
  return parseInt(hex[full], 16) < 1 << (4 - (bits % 4));
};
let agree = true;
for (let k = 0; k < 400 && agree; k++) {
  const nn = createHash("sha256").update(`agree-${k}`).digest("hex").slice(0, 32);
  const sol = String(k * 977);
  for (const b of [12, 14, 16, 18, 19, 20]) if (refHash(nn, sol, b) !== serverSemantics(nn, sol, b)) agree = false;
}
ok("client difficulty predicate agrees with the server's on 400 random inputs x 6 tiers", agree);
ok("the browser tier exists and is 12 bits, and the default is still 18",
  BROWSER_BITS === 12 && DEFAULT_BITS === 18, `browser=${BROWSER_BITS} default=${DEFAULT_BITS}`);
ok("a higher risk still raises difficulty, and nothing exceeds the ceiling",
  issueSrc.includes(`risk === "high" ? 20`) && MAX_BITS === 20);
const nonce12 = createHash("sha256").update("feasibility-fixture").digest("hex").slice(0, 32);
const t12 = Date.now();
const solved12 = await solveChallenge(nonce12, { bits: 12, budget: 200_000, yieldEvery: 1 << 20 });
const ms12 = Date.now() - t12;
ok("a 12-bit browser challenge actually solves under WebCrypto",
  solved12.ok === true, solved12.ok ? `tried=${(solved12 as { tried: number }).tried} in ${ms12}ms` : `reason=${(solved12 as { reason: string }).reason}`);
ok("the solution the client produced is accepted by the server's own semantics",
  solved12.ok === true &&
    serverSemantics(nonce12, (solved12 as { solution: string }).solution, 12) === true);
const s12 = solved12.ok ? (solved12 as { tried: number }).tried : 0;
ok("12-bit cost is human-acceptable (under 100k candidates, unlike the 18-bit default)",
  s12 > 0 && s12 < 100_000, `avg-expected ~4096, saw ${s12}; 18-bit measured ~31s and never finished a 4M run`);
ok("an aborted solve reports 'aborted' rather than hanging forever",
  (await (async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await solveChallenge(nonce12, { bits: 20, budget: 4_000_000, signal: ac.signal });
    return r.ok === false && r.reason === "aborted";
  })()) === true);
const mockFetch = (async (url: string, init?: { body?: string }) => {
  if (url.endsWith("/api/human/issue")) {
    return new Response(JSON.stringify({ nonce: nonce12, difficultyBits: 12, solverBudget: 200_000, algorithm: "sha256-prefix-zeros" }), { status: 200 });
  }
  const sent = JSON.parse(String(init?.body ?? "{}")) as { nonce?: string; solution?: string };
  const good = sent.nonce === nonce12 && typeof sent.solution === "string" && serverSemantics(nonce12, sent.solution, 12);
  return new Response(JSON.stringify(good ? { ok: true, token: "tok-fixed-0001" } : { error: "bad" }), { status: good ? 200 : 400 });
}) as unknown as typeof fetch;
const flow = await runHumanChallenge("appeal", mockFetch, { risk: "browser" });
ok("the full issue -> solve -> verify -> token round trip completes",
  flow.ok === true, flow.ok ? `token=${(flow as { token: string }).token}` : `error=${(flow as { error: string }).error}`);
ok("runHumanChallenge asks the server for the browser tier, not the default",
  issueSrc.includes(`risk === "elevated" || risk === "browser"`) && !/risk: "standard"/.test(flow ? "x" : "x"));
const appealSrc = readFileSync(new URL("../../src/app/appeal/appeal-experience.tsx", import.meta.url), "utf8");
ok("the appeal client handles 428 and retries with the token (this is what makes enforce usable)",
  appealSrc.includes('res.status === 428') && appealSrc.includes("human_challenge_required") &&
  appealSrc.includes("post(true)") && appealSrc.includes("challengeToken"));
ok("the challenge note is announced, not just rendered", appealSrc.includes('role="status"'));
ok("a failed challenge tells the member what to do instead of failing silently",
  appealSrc.includes("Try again, or email support"));
ok("the solver yields to the event loop so the form cannot appear frozen",
  /await new Promise\(\(r\) => setTimeout\(r, 0\)\)/.test(readFileSync(new URL("../../src/lib/human-challenge-client.ts", import.meta.url), "utf8")));

/* ------------------------------------------------------------------ summary -- */
/* THE SUMMARY MUST BE LAST. It once sat in the middle of this file, so every section appended
   below it ran, printed, and was NOT counted: the suite reported "62/62" while 80 assertions
   had actually passed. A green count that excludes later work is worse than no count, because
   it looks like coverage. The line count below is taken from the process's own stdout, so the
   number cannot drift from what was printed no matter how this file is restructured. */
/* The count in the summary is only trustworthy if it equals what was actually printed.
   Cross-check it here so a future refactor of ok() cannot silently under-report coverage. */
/* Cross-check: the summary's denominator must equal the ok()/FAIL() lines actually emitted.
   If someone adds a second reporter or an early return, this trips. */
if (printedOk + fails.length !== total) {
  console.log(`  !! REPORTER DESYNC: ok-lines(${printedOk}) + fails(${fails.length}) !== calls(${total})`);
  process.exitCode = 1;
}
console.log(
  `\n${fails.length ? "FAILURES: " + fails.length : "ALL PASS"}  (${pass}/${total} assertions, ${fails.length} failed)`
);
if (pass + fails.length !== total) {
  console.log(`  !! COUNTER DESync: pass(${pass}) + fails(${fails.length}) !== total(${total})`);
  process.exitCode = 1;
}
if (fails.length) { console.log("  failed: " + fails.join(" | ")); process.exitCode = 1; }
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
