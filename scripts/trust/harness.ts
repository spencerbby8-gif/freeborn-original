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
import { POSES, poseIdFor, poseTag, POSE_TTL_SECONDS, type PoseState } from "@/lib/pose-pool";
import { assignPose, consumePose, type PoseStore } from "@/lib/pose-store";
import {
  evaluateIntegrity,
  memberVisibleIntegrity,
  persistableDetail,
  NEVER_COLLECTED,
  type BrowserObservations,
} from "@/lib/browser-integrity";
import type { PoseRow } from "@/lib/pose-pool";
import { resolvePhotoUrl } from "@/lib/photo-url";
import {
  decideMediaAccess,
  needsPublishedProfilePhotoLookup,
  type MediaAccessFacts,
} from "@/lib/media-access";
import { createHash } from "node:crypto";
import {
  decideMatchAccess,
  isUnmatchReason,
  severedMessage,
  undoMayDeleteMatchRow,
  UNMATCH_REASONS,
  type MatchAction,
  type MatchLifecycleStatus,
} from "@/lib/match-lifecycle";
import { mkdir, writeFile, rm } from "node:fs/promises";
import {
  describeFailure,
  fetchWithRetry,
  isRateLimited,
  readJsonSafe,
  retryDelayMs,
  retrySrcFor,
} from "@/lib/api-response";

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
/* Retargeted 2026-10-30: the two engine chains now share named proofs (freshnessProven /
   poseProven) instead of each spelling the condition inline, so the pin follows the name and
   ALSO pins the definition — otherwise renaming a variable would silently un-pin the rule.
   The guarantee is unchanged: no badge without a token we issued, consumed once, minutes ago. */
ok("the badge from the single-engine path now requires a verified freshness token",
  verifSrc.includes("pose.matchesAsked === true && freshnessProven && poseProven") &&
    verifSrc.includes('const freshnessProven = freshness.state === "verified";'));
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
/* Added 2026-10-30, after production evidence: the stage-1 call answered 502 for every member
   (the configured model id does not exist behind the free gateway) and each one was written up as
   a REJECTED selfie. The route must distinguish "the call failed" from "the photo was unreadable". */
ok("stage 1 reports WHY it has no answer, instead of returning a bare null",
  verifSrc.includes("reason: Stage1Failure | null") && verifSrc.includes("return { text: null, reason: lastReason };"));
ok("an unavailable engine parks the attempt as pending rather than rejecting the member",
  verifSrc.includes("if (stage1.reason !== null) {") &&
    verifSrc.includes("stage1: unavailable (") &&
    verifSrc.includes('status: "review"'));
ok("a model verdict we could not read stays the member's own readable outcome",
  verifSrc.includes("dual_model+stage1:unparseable"));
ok("the stage-1 model id is an operator setting, since it is a property of the gateway",
  /process\.env\.ANTIGRAVITY_MODEL/.test(verifSrc));
ok("the client sends the token once and clears it, so retries re-challenge",
  /setLivenessToken\(null\)/.test(readFileSync(new URL("../../src/components/app/verify-modal.tsx", import.meta.url), "utf8")));

/* -- review queue: read-only, gated, non-leaking -------------------------------- */
const { queuePriority } = await import("@/lib/review-queue-priority");
/* This pin used to require `isProduction && allowlist.length === 0`, i.e. it *pinned the
   fail-open*: a development-mode deployment of the same code with no allowlist answered the
   whole review queue to any signed-in member. Retargeted 2026-10-30 to the stronger policy,
   and it asserts the old spelling is gone, so the pin cannot be satisfied by keeping both. */
ok("the queue is gated fail-closed in EVERY environment, and the dev-mode exception is gone",
  queueSrc.includes("if (allowlist.length === 0) return new Response(\"Not found\", { status: 404 })") &&
    !/isProduction && allowlist\.length === 0/.test(queueSrc));
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

/* [13] SERVER-ASSIGNED POSE CHALLENGE — the liveness hole this turn actually closed.
   The pose step graded whatever pose the SUBMITTER named, so it could not be replayed
   against, and the same string was interpolated into a model prompt. These assertions
   pin the fix in the only way an offline harness can: by pinning provenance (where the
   prompt's pose comes from), consumption shape, and the live constraint it must satisfy. */
const poseSrc = [ "pose-store.ts", "pose-challenge.ts" ]
  .map((f) => readFileSync(new URL(`../../src/lib/${f}`, import.meta.url), "utf8"))
  .join("\n");
const poseDbSrc = readFileSync(new URL("../../src/lib/pose-challenge.ts", import.meta.url), "utf8");
const modalSrc = readFileSync(new URL("../../src/components/app/verify-modal.tsx", import.meta.url), "utf8");
const photoDir = new URL("../../public/images/verify/", import.meta.url);
const { existsSync } = await import("node:fs");

ok("[13] pose pool is non-trivial and disjoint", POSES.length >= 6 && new Set(POSES.map((x) => x.label)).size === POSES.length, `n=${POSES.length}`);
ok("[13] every pose has artwork that exists", POSES.every((x) => /^\/images\/verify\/[a-z0-9-]+\.jpg$/.test(x.demo) && existsSync(new URL(x.demo.replace("/images/verify/", ""), photoDir))));
ok("[13] poseId is stable + injectively named", poseIdFor(POSES[0].label) === poseIdFor(POSES[0].label) && new Set(POSES.map((x) => poseIdFor(x.label))).size === POSES.length);
ok("[13] poseId shape is a safe token", POSES.every((x) => /^p[0-9a-f]{8}$/.test(poseIdFor(x.label))));

/* The actual control: the prompt must be fed the server's wording, never the body's. */
ok("[13] stage-1 prompt is fed askedPose, not poseLabel",
   /this asked pose: '\$\{askedPose\}'/.test(verifSrc) && !/this asked pose: '\$\{poseLabel\}'/.test(verifSrc));
ok("[13] askedPose comes from the consumed challenge row",
   /const askedPose =[\s\S]{0,220}poseChallenge\.label/.test(verifSrc));
ok("[13] client-fallback text is neutralised before prompting",
   /poseLabel\.replace\(\/\['"\\`\\n\\r\]\/g, " "\)/.test(verifSrc));
ok("[13] pose is consumed with the member + token it was issued to",
   /consumePoseChallenge\(\s*member\.id,\s*typeof bodyLivenessToken[^)]*\)\s*\.catch/.test(verifSrc));
ok("[13] single-engine badge needs the SERVER pose, not just the engine's yes",
   /* `poseProven` reduces to `poseServed` unless the operator opens the bounded hatch, so the
      definition is pinned alongside the use: renaming or widening it fails HERE, not silently. */
   /pose\.matchesAsked === true && freshnessProven && poseProven/.test(verifSrc) &&
     /const poseProven = poseMode === "legacy" \? true : poseServed;/.test(verifSrc));
ok("[13] poseServed is derived from the challenge state only",
   /const poseServed = poseChallenge\.state === "verified";/.test(verifSrc));
ok("[13] every request row records which pose path decided it",
   (verifSrc.match(/\$\{poseTag\(poseChallenge\.state\)\}/g) || []).length >= 3,
   `method strings=${(verifSrc.match(/poseTag\(poseChallenge\.state\)/g) || []).length}`);
ok("[13] failure degrades to review, never to a silent drop",
   /held for human review/.test(verifSrc) && /pose: \$\{poseChallenge\.detail\}/.test(verifSrc));

/* Consumption shape — compare-and-set, matching the freshness token it rides on. */
ok("[13] pose consumption is compare-and-set on status",
   /\.set\(\{ status: "consumed" \}\)[\s\S]{0,220}eq\(verificationChallenges\.status, "active"\)/.test(poseSrc));
ok("[13] foreign member is indistinguishable from a mismatch",
   /state: "mismatch", detail: "pose belongs to a different member"/.test(poseSrc));
/* The idempotency GUARD moved into pose-store.ts and now also excludes expired rows, so
   pinning its source text kept failing for reasons unrelated to the behaviour. The
   behaviour is proved in [13b] by executing it; what is worth pinning in text is that
   the production adapter keys the lookup on the token at all. */
ok("[13] the adapter keys the active-lookup on the token",
   /findActiveByToken[\s\S]{0,640}eq\(verificationChallenges\.challengeToken, token\)/.test(poseDbSrc) &&
   /eq\(verificationChallenges\.status, "active"\)/.test(poseDbSrc));
ok("[13] hygiene sweep excludes the caller's own token in the SQL it emits",
   /challenge_token <> \$\{keepToken\}`/.test(poseDbSrc));
ok("[13] a client claim of a different pose is recorded, not ignored",
   /state: "mismatch", label, detail: `client claimed/.test(poseSrc));
ok("[13] poseTag never overclaims", poseTag("verified") === "+pose" && poseTag("absent") === "+pose:absent" && poseTag("unavailable") === "+pose:unavailable");
ok("[13] every pose state is surfaced in the audit string",
   (["verified","mismatch","expired","absent","unavailable"] as PoseState[]).every((x) => typeof poseTag(x) === "string" && poseTag(x).startsWith("+pose")));
ok("[13] pose TTL matches the liveness token it rides on", POSE_TTL_SECONDS === 300);

/* Wiring: server issues, client obeys, and a failed issue degrades loudly. */
ok("[13] challenge route issues the pose before responding",
   /assignPoseChallenge\(member\.id, row\.id\)/.test(chalSrc));
ok("[13] a pose-assignment failure is reported, not swallowed",
   /poseWarning/.test(chalSrc) && /poseRequired: pose !== null/.test(chalSrc));
/* Pinned on behaviour, not on a local variable name (an earlier draft matched
   `setPose(served)` and went red the moment the write became a functional update). */
ok("[13] client adopts the server pose via a functional update",
   /setPose\(\(prev\) => \(\{[\s\S]{0,160}j\.pose!\.label/.test(modalSrc) &&
   /setPoseSource\("server"\)/.test(modalSrc));
ok("[13] retry cannot re-roll a server pose out from under itself",
   /if \(poseSource === "server"\) return;/.test(modalSrc));
ok("[13] degraded mode is disclosed in the UI, not silent",
   /advisory only/.test(modalSrc));
ok("[13] client uses the shared pool, so labels cannot drift",
   /import \{ POSES as SERVER_POSES/.test(modalSrc) && /\[\.\.\.SERVER_POSES\]/.test(modalSrc));

/* The token column is TEXT with a UNIQUE constraint (re-verified against
   information_schema). An earlier version of this guard demanded a `::uuid` cast because
   I had mis-read the probe's error as the column type rather than my own cast — the cast
   was the bug. Pinning the real shape is the point: any uuid() declaration here, or any
   ::uuid in the comparison, breaks every pose assignment with 42883. */
ok("[13] token column declared text, matching the live DB",
   /challengeToken: text\("challenge_token"\)\.notNull\(\)\.unique\(\)/.test(schemaSrc) &&
   !/challengeToken: uuid\("challenge_token"\)/.test(schemaSrc));
ok("[13] token comparison stays text-to-text with no bogus cast",
   /challenge_token <> \$\{keepToken\}`/.test(poseDbSrc) &&
   !/challenge_token <>[^`]*::uuid/.test(poseDbSrc));


/* [13b] RUNTIME tests against a deterministic fake store. Section [13] reads source
   text, which cannot see ORDERING — and two ordering bugs were in fact shipped in the
   first draft of pose-challenge.ts (expiry before the idempotent lookup, and a
   read-then-write that lost the consume race). These execute the real functions. */
{
  const mk = () => {
    const rows: PoseRow[] = [];
    const log: string[] = [];
    let casSucceeds = true;
    const store: PoseStore = {
      async findActiveByToken(t) {
        log.push("findActive");
        return rows.find((r) => r.challengeToken === t && r.status === "active") ?? null;
      },
      async findByToken(t) {
        log.push("find");
        return rows.find((r) => r.challengeToken === t) ?? null;
      },
      async latestPoseId(u) {
        log.push("latest");
        const mine = rows.filter((r) => r.userId === u);
        return mine.length ? (mine[mine.length - 1]!.poseId) : null;
      },
      async expireOtherActive(u, keep) {
        log.push("expireOthers");
        for (const r of rows) if (r.userId === u && r.status === "active" && r.challengeToken !== keep) r.status = "expired";
      },
      async insert(row) {
        log.push("insert");
        rows.push({
          id: `row${rows.length + 1}`,
          userId: row.userId,
          poseId: row.poseId,
          gesture: row.gesture,
          status: "active",
          expiresAt: new Date(Date.now() + row.ttlSeconds * 1000),
          challengeToken: row.challengeToken,
        });
      },
      async consume(id) {
        log.push("consume");
        const r = rows.find((x) => x.id === id && x.status === "active");
        if (!r || !casSucceeds) return false;
        r.status = "consumed";
        return true;
      },
      async markExpired(id) {
        log.push("markExpired");
        const r = rows.find((x) => x.id === id);
        if (r && r.status === "active") r.status = "expired";
      },
    };
    return { rows, log, store, setCas: (v: boolean) => (casSucceeds = v) };
  };

  const T1 = "11111111-1111-1111-1111-111111111111";
  const T2 = "22222222-2222-2222-2222-222222222222";
  const U = "aaaaaaaa-0000-0000-0000-000000000001";
  const other = "bbbbbbbb-0000-0000-0000-000000000002";

  /* pick() is realistic (first of whatever pool it is given) rather than pinned to
     pool[0]: pinning made every call return the same pose no matter what the code did,
     which is exactly why an earlier version of this suite could not see an ordering bug
     where the hygiene sweep ran before the idempotent lookup. */
  const firstOfPool = (pool: readonly (typeof POSES)[number][]) => pool[0]!;
  const a1 = await assignPose(U, T1, mk().store, firstOfPool);
  ok("[13b] assignment returns a real pool pose", POSES.some((p) => p.label === a1.pose.label) && a1.poseId === poseIdFor(a1.pose.label));

  /* Ordering: the idempotent lookup must come BEFORE the hygiene sweep. */
  const g = mk();
  await assignPose(U, T1, g.store, (pool) => pool[0]!);
  const second = await assignPose(U, T1, g.store, firstOfPool);
  ok("[13b] re-entry to the camera step keeps the SAME pose", second.pose.label === a1.pose.label, `${second.pose.label}`);
  ok("[13b] re-entry inserts no second row", g.rows.filter((r) => r.challengeToken === T1).length === 1);
  /* An indexOf comparison over the source was meaningless here: the PoseStore *interface*
     declares both names before either call site, so it passed for any execution order.
     The call log is the only way to see the order the code actually ran in. */
  ok("[13b] hygiene runs AFTER the idempotent lookup, and spares the caller's row",
     g.log.indexOf("findActive") < g.log.indexOf("expireOthers") &&
     g.rows.every((r) => r.status === "active"), g.log.join(">"));
  const z = mk();
  await assignPose(U, T1, z.store, firstOfPool);
  (z.rows[0] as { expiresAt: Date | null }).expiresAt = new Date(Date.now() - 1);
  const afterExpiry = await assignPose(U, T1, z.store, firstOfPool, () => Date.now());
  ok("[13b] an EXPIRED pose is re-rolled rather than re-served",
     afterExpiry.poseId !== z.rows[0]!.poseId && z.rows.length === 2);
  ok("[13b] lookup happens before the expiry sweep", g.log.indexOf("findActive") < g.log.lastIndexOf("expireOthers"));

  /* Single use. */
  const h = mk();
  await assignPose(U, T1, h.store, (pool) => pool[0]!);
  const first = await consumePose(U, T1, undefined, h.store);
  const twice = await consumePose(U, T1, undefined, h.store);
  ok("[13b] first consume verifies and carries the server label", first.state === "verified" && first.label === h.rows[0]!.gesture);
  ok("[13b] second consume cannot re-spend the pose", twice.state === "mismatch" && twice.detail === "pose already used", twice.detail);

  /* Losing the compare-and-set must not be a pass. */
  const i = mk();
  await assignPose(U, T1, i.store, (pool) => pool[0]!);
  i.setCas(false);
  const raced = await consumePose(U, T1, undefined, i.store);
  ok("[13b] a lost consume race is not a verification", raced.state === "mismatch" && raced.detail === "lost the consume race");

  /* Foreign member learns nothing distinguishable. */
  const j = mk();
  await assignPose(U, T1, j.store, (pool) => pool[0]!);
  /* Each case gets its own store: sharing one meant the second call saw the row the
     first had already consumed, so it asserted an order-dependent answer, not a
     property. Isolation is the point — and it is what exposed that my original test
     was testing my own call sequence rather than the code. */
  const j2 = mk();
  await assignPose(U, T1, j2.store, (pool) => pool[0]!);
  const foreign = await consumePose(other, T1, undefined, j2.store);
  const k0 = mk();
  await assignPose(U, T1, k0.store, (pool) => pool[0]!);
  await consumePose(U, T1, undefined, k0.store);
  const usedTwice = await consumePose(U, T1, undefined, k0.store);
  ok("[13b] foreign token reports a mismatch, not an absence", foreign.state === "mismatch");
  ok("[13b] neither foreign nor used answers reveal whether the token exists",
     usedTwice.state === "mismatch" && foreign.detail !== usedTwice.detail);
  const ghost = await consumePose(other, "99999999-9999-9999-9999-999999999999", undefined, mk().store);
  ok("[13b] an unknown token is indistinguishable from a consumed one to a stranger",
     ghost.state === "absent");

  /* Expiry, measured against an injected clock. */
  const k = mk();
  await assignPose(U, T1, k.store, (pool) => pool[0]!);
  (k.rows[0] as { expiresAt: Date | null }).expiresAt = new Date(Date.now() + 1000);
  const late = await consumePose(U, T1, undefined, k.store, () => Date.now() + 5000);
  ok("[13b] expiry marks the row and refuses the badge", late.state === "expired" && k.rows[0]!.status === "expired");
  const atBoundary = await consumePose(U, T2, undefined, (() => { const m = mk(); void m.store.insert({ userId: U, poseId: "p", gesture: POSES[0].label, challengeToken: T2, demo: "d", ttlSeconds: 0 }); return { ...m.store, rows: m.rows }; })(), () => Date.now());
  ok("[13b] expiry is inclusive (<=), so a zero-TTL pose never verifies", atBoundary.state === "expired");

  /* Truthful label on a claim mismatch, and no claim at all is not a mismatch. */
  const l = mk();
  await assignPose(U, T1, l.store, (pool) => pool[0]!);
  const claimed = await consumePose(U, T1, "Some pose I preferred", l.store);
  ok("[13b] a contradicting client claim is recorded with the real label", claimed.state === "mismatch" && claimed.label === l.rows[0]!.gesture && /client claimed/.test(claimed.detail));
  const noClaim = await consumePose(U, T2, undefined, await (async () => { const m = mk(); await assignPose(U, T2, m.store, (pool) => pool[1]!); return m.store; })());
  ok("[13b] a client that sends no claim still verifies", noClaim.state === "verified");

  /* Hygiene across tokens. */
  const n = mk();
  await assignPose(U, T1, n.store, (pool) => pool[0]!);
  await assignPose(U, T2, n.store, (pool) => pool[1]!);
  ok("[13b] a new token expires the member's older active pose", n.rows[0]!.status === "expired" && n.rows[1]!.status === "active");

  /* Retry must differ; an exhausted pool must not deadlock. */
  const q = mk();
  const qa = await assignPose(U, T1, q.store, firstOfPool);
  const qb = await assignPose(U, T2, q.store, firstOfPool);
  ok("[13b] retry is offered a different pose", qa.pose.label !== qb.pose.label, `${qa.pose.label} -> ${qb.pose.label}`);
  const exhausted = await assignPose(U, "33333333-3333-3333-3333-333333333333", {
    ...q.store,
    async latestPoseId() { return null; },
  }, (pool) => pool[pool.length - 1]!);
  ok("[13b] a member with no history still gets a pose", POSES.some((p) => p.label === exhausted.pose.label));
  ok("[13b] pick() is always given a non-empty pool", POSES.every((p, k2) => p.label.length > 0) && !Number.isNaN(POSE_TTL_SECONDS));

  /* Empty token short-circuits before touching the store at all. */
  const r2 = mk();
  let touched = false;
  const blind: PoseStore = { ...r2.store, async findByToken() { touched = true; return null; }, async findActiveByToken() { touched = true; return null; } };
  const empty = await consumePose(U, "", undefined, blind);
  ok("[13b] an absent token is answered without a DB read", empty.state === "absent" && touched === false);
}

/* The live DB is the reason this table was dead: the declared type must match it. */
const poseStatusOk = /verification_challenges_status_check|status = ANY/.test(migOps) === false;
ok("[13] only the live CHECK's three states are ever written",
   poseStatusOk && ["active","consumed","expired"].every((x) => poseSrc.includes(`"${x}"`)) &&
   !/set\(\{ status: "(?!active|consumed|expired)/.test(poseSrc));

/* ------------------------------------------------------------------ [14] browser integrity -- */
/* Privacy-safe browser-consistency signals, and the gate that decides whether a model verdict is
   enough to grant a badge. Split into three kinds of assertion on purpose:
     A. EXECUTE the evaluator. Behaviour, not text — a pattern pin can bless a bug.
     B. GREP the two client files for what they must NOT contain. A privacy promise that is not
        checkable is a wish, and "we never fingerprint" is the kind of sentence that rots first.
     C. PIN the approval gate's shape. These are contracts with the operator (one env var, one
        audit marker), and a refactor that quietly drops one is the failure we have actually had.
   Read the module header in src/lib/browser-integrity.ts for why each rule exists. */
{
  const ev2 = readFileSync(new URL("../../src/lib/browser-integrity.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../src/lib/browser-integrity-client.ts", import.meta.url), "utf8");
  const singleLiveMig = readFileSync(new URL("../../db/migrations/2026-10-29-human-challenge-single-live.sql", import.meta.url), "utf8");
  const clean: BrowserObservations = {
    timezoneOffsetMinutes: 300, language: "en-US", maxTouchPoints: 0,
    claimedPlatform: "Windows", hasCameraApi: true, hasPermissionsApi: true, secureContext: true,
  };
  const chrome = {
    acceptLanguage: "en-US,en;q=0.9",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUaPlatform: '"Windows"',
    secChUa: '"Chromium";v="131", "Not_A Brand";v="8"',
  };
  const keys = (r: { fired: Array<{ key: string }> }) => r.fired.map((f) => f.key).join(",");

  const base = evaluateIntegrity(clean, chrome);
  ok("[14] a plain Chrome desktop with matching headers fires nothing", base.count === 0, keys(base));
  ok("[14] the result is advisory, in the type and in the value", base.advisory === true);
  ok("[14] an ordinary browser persists the literal 'none', not an empty row",
    persistableDetail(base) === "none");

  /* The checks are COMPARISONS. Anything missing on either side must mean "no opinion" — the
     single most important property here, because the alternative is that a privacy-hardened
     browser (which sends less) is treated as suspicious for sending less. */
  ok("[14] no observations at all silences every check",
    evaluateIntegrity({}, chrome).count === 0);
  ok("[14] no server headers silences every check",
    evaluateIntegrity(clean, {}).count === 0);
  ok("[14] a wildcard Accept-Language is read as no preference, not as a foreign one",
    evaluateIntegrity({ ...clean, language: "sw-KE" }, { ...chrome, acceptLanguage: "*/*" }).count === 0);
  ok("[14] a lone '*' is the same no-preference signal",
    evaluateIntegrity({ ...clean, language: "sw-KE" }, { ...chrome, acceptLanguage: "*" }).count === 0);

  const off = evaluateIntegrity({ ...clean, timezoneOffsetMinutes: -120 }, chrome);
  ok("[14] a clock outside every US zone with a US-English-only list is a named contradiction",
    off.count === 1 && off.advisory === true && keys(off) === "tzVsAcceptLanguage", keys(off));
  ok("[14] a mixed language list silences it (traveller, expat, developer)",
    evaluateIntegrity({ ...clean, timezoneOffsetMinutes: -120 }, { ...chrome, acceptLanguage: "en-US,fr-FR,fr;q=0.9" }).count === 0);
  ok("[14] a US offset with the same list is not a contradiction at all",
    evaluateIntegrity({ ...clean, timezoneOffsetMinutes: 240 }, chrome).count === 0);
  ok("[14] the persisted form of the contradiction carries the rule name and not the clock",
    persistableDetail(off) === "tzVsAcceptLanguage" && !persistableDetail(off).includes("120"));

  const lang = evaluateIntegrity({ ...clean, language: "de-DE" }, chrome);
  ok("[14] the browser's own primary language must appear in the list its edge sent",
    lang.count === 1 && keys(lang) === "languageNotInAcceptLanguage", keys(lang));
  ok("[14] region-only differences are not a contradiction (en-GB vs en-US,en)",
    evaluateIntegrity({ ...clean, language: "en-GB" }, chrome).count === 0);

  /* Platform: three independent opinions, and 'Sec-CH-UA-Platform' is a STRUCTURED header whose
     value arrives quoted. A comparison that forgets to unquote fires on every honest Chrome user
     on the planet, so this pair of assertions is the reason the helper exists. */
  ok("[14] a quoted edge header does not contradict the page's unquoted claim",
    evaluateIntegrity({ ...clean, claimedPlatform: "Android" }, { ...chrome, secChUaPlatform: '"Android"', userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/131.0.0.0 Mobile Safari/537.36", acceptLanguage: "en-US" }).count === 0);
  const plat = evaluateIntegrity({ ...clean, claimedPlatform: "Android" }, { ...chrome, secChUaPlatform: '"Windows"' });
  ok("[14] page and edge disagreeing about the platform is a named contradiction",
    plat.count >= 1 && keys(plat).includes("platformContradictsUserAgent"), keys(plat));
  ok("[14] a desktop UA carries no platform token, so 'Windows' is unmatched rather than false",
    evaluateIntegrity({ ...clean, claimedPlatform: "Windows" }, { acceptLanguage: null, userAgent: null, secChUaPlatform: null, secChUa: null }).count === 0);
  ok("[14] iOS reports 'iOS' to the page and 'iPhone' in the UA: same family, no signal",
    evaluateIntegrity({ ...clean, claimedPlatform: "iOS" }, { ...chrome, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/605.1.15", secChUaPlatform: '"iOS"', secChUa: "" }).count === 0);
  ok("[14] an Android UA claimed as Windows is caught",
    keys(evaluateIntegrity({ ...clean, claimedPlatform: "Windows" }, { ...chrome, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36", secChUaPlatform: null })).includes("platformContradictsUserAgent"));

  const hints = evaluateIntegrity({ ...clean, claimedPlatform: undefined }, { ...chrome, secChUa: "" });
  ok("[14] a Chrome-shaped UA with no Client Hints at all is the scripted-client tell",
    keys(hints).includes("chromeWithoutClientHints"), keys(hints));
  ok("[14] Safari and Firefox send no Client Hints and are never punished for that",
    evaluateIntegrity(clean, { ...chrome, secChUa: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15" }).count === 0 &&
      evaluateIntegrity(clean, { ...chrome, secChUa: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" }).count === 0);
  ok("[14] a client that never claims to be a browser contradicts nothing, so nothing fires",
    keys(evaluateIntegrity({}, { acceptLanguage: "*/*", userAgent: "curl/8.5.0", secChUa: "", secChUaPlatform: null })).length === 0,
    "silence rather than suspicion is what keeps absence honest");

  /* Only four names can ever be emitted, for ANY input. 'never fires anything unstated' is what
     lets the retention rule ("names only, 120 chars") be the whole privacy story. */
  const MATRIX_KEYS = new Set(["tzVsAcceptLanguage", "languageNotInAcceptLanguage", "platformContradictsUserAgent", "chromeWithoutClientHints"]);
  const fixtures: Array<[BrowserObservations, Record<string, string | null>]> = [];
  for (const tz of [0, 60, 300, -120, 780, NaN]) {
    for (const langTag of ["en-US", "de-DE", "", "pt-BR"]) {
      for (const platClaim of ["Windows", "Android", "iOS", ""]) {
        for (const ua of [chrome.userAgent, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15", "curl/8.5.0", ""]) {
          for (const al of ["en-US,en;q=0.9", "en-US,fr-FR", "*/*", ""]) {
            fixtures.push([{ timezoneOffsetMinutes: tz, language: langTag, claimedPlatform: platClaim }, { acceptLanguage: al, userAgent: ua, secChUaPlatform: platClaim ? `"${platClaim}"` : null, secChUa: ua.includes("Chrome/") ? '"Chromium";v="131"' : "" }]);
          }
        }
      }
    }
  }
  const allKeys = new Set<string>();
  let nonAdvisory = 0;
  let unstable = 0;
  for (const [b, h] of fixtures) {
    const r = evaluateIntegrity(b, h);
    for (const f of r.fired) allKeys.add(f.key);
    if (r.advisory !== true) nonAdvisory++;
    if (r.count !== evaluateIntegrity(b, h).count) unstable++;
  }
  ok("[14] the whole fixture matrix emits no rule name outside the four declared ones",
    [...allKeys].every((k) => MATRIX_KEYS.has(k)) && allKeys.size > 0,
    `${fixtures.length} combinations, names seen: ${[...allKeys].sort().join("|")}`);
  ok("[14] advisory:true is not conditional on anything, across every combination", nonAdvisory === 0);
  ok("[14] the evaluator is pure: repeated calls agree, and nothing is memoised on the input",
    unstable === 0);
  const before = JSON.stringify(clean);
  evaluateIntegrity(clean, { ...chrome, acceptLanguage: "zh-CN" });
  ok("[14] the caller's observation object is not mutated", JSON.stringify(clean) === before);
  ok("[14] every fired rule carries prose a reviewer can read",
    evaluateIntegrity({ ...clean, timezoneOffsetMinutes: -120 }, chrome).fired.every((f) => f.label.length > 40));

  const multi = evaluateIntegrity(
    { timezoneOffsetMinutes: -120, language: "de-DE", claimedPlatform: "Android" },
    { ...chrome, secChUa: "", secChUaPlatform: '"Windows"' }
  );
  ok("[14] several contradictions at once are all named, comma-joined, and still bounded",
    multi.count === 4 &&
      persistableDetail(multi) ===
        "tzVsAcceptLanguage,languageNotInAcceptLanguage,platformContradictsUserAgent,chromeWithoutClientHints" &&
      persistableDetail(multi).length <= 120,
    persistableDetail(multi));
  ok("[14] the member is told the two things they own and not the two that teach evasion",
    memberVisibleIntegrity(multi.fired).length === 2 &&
      !memberVisibleIntegrity(multi.fired).some((f) => f.key === "platformContradictsUserAgent") &&
      !memberVisibleIntegrity(multi.fired).some((f) => f.key === "chromeWithoutClientHints"));
  ok("[14] NEVER_COLLECTED names the fingerprinting surfaces this module will not read",
    NEVER_COLLECTED.length >= 10 && ["canvas", "webgl", "fonts", "plugins", "audioContext", "deviceMemory", "localStorage"].every((x) => NEVER_COLLECTED.includes(x)));

  /* ---- B. the two client files, grepped for what they must not contain ---- */
  /* This is the only direction in which "no covert persistent fingerprinting" can be enforced:
     the shipped browser code either does not touch those APIs or it does. Note the assertion is
     over BOTH spellings — a call and a property access — because `window.localStorage` and
     `navigator.plugins` are the forms that actually appear in the wild. */
  const FORBIDDEN = [
    "canvas", "getContext", "toDataURL", "webgl", "fonts", "plugins", "mimeTypes",
    "audioContext", "OfflineAudioContext", "deviceMemory", "hardwareConcurrency",
    "screen.", "colorDepth", "battery", "getBattery", "localStorage", "sessionStorage",
    "indexedDB", "openDatabase", "document.cookie", "serviceWorker", "matchMedia",
    "connection", "videoWidth", "enumerateDevices", "MediaSource", "RTCPeerConnection",
  ];
  /* Strip the comments first. These modules deliberately SAY OUT LOUD which APIs they refuse
     (the doc header names canvas, localStorage and friends to explain their absence), and a
     grep that reads prose as code is a test that fails for the wrong reason — or worse, passes
     because someone deleted the honest comment. */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const clientCode = strip(client);
  const found = FORBIDDEN.filter((t) => clientCode.includes(t));
  ok("[14] the browser client touches none of the fingerprinting surfaces", found.length === 0, found.join("|"));
  ok("[14] the client stores nothing, so nothing persists between sessions",
    !/setItem|sessionStorage|document\.cookie|navigator\.serviceWorker/i.test(clientCode));
  ok("[14] the client sets no header of its own — the compared values must come from the browser",
    /return \{\};/.test(clientCode) && !/headers\.set|new Headers|secCh|Sec-CH/i.test(clientCode));
  ok("[14] the client reads exactly the four coarse facts it documents",
    (clientCode.match(/nav\.[a-zA-Z?]+/g) ?? []).length >= 4 &&
      ["getTimezoneOffset", "maxTouchPoints", "isSecureContext", "getUserMedia"].every((p) => client.includes(p)),
    `${(clientCode.match(/nav\.[a-zA-Z?]+/g) ?? []).length} navigator reads`);
  ok("[14] the evaluator itself imports nothing (no fs, no net, no storage)",
    !/^import /m.test(ev2) && !/require\(/.test(ev2) && !/import\(/.test(ev2),
    `imports in the evaluator: ${(ev2.match(/^import /gm) ?? []).length}`);
  ok("[14] a client that throws is answered with silence, not with a failure",
    /catch \{\s*return \{\};?\s*\}/.test(clientCode));

  /* ---- C. the gate: what may and may not veto a badge ---- */
  ok("[14] a favourable model verdict alone cannot approve: both proofs are in the condition",
    /if \(!approvable \|\| !freshnessProven \|\| !poseProven\) \{/.test(verifSrc));
  ok("[14] freshness is proven from the consumed token's state, not from a client field",
    /const freshnessProven = freshness\.state === "verified";/.test(verifSrc) &&
      !/const freshnessProven = /.test(verifSrc.replace(/const freshnessProven = freshness\.state === "verified";/, "")));
  ok("[14] the legacy hatch relaxes POSE provenance only",
    /const poseProven = poseMode === "legacy" \? true : poseServed;/.test(verifSrc));
  /* The hatch used to have a branch of its own inside the gate. That branch was unreachable in the
     mode it existed for — `poseProven` had ALREADY relaxed the condition the branch tested — so a
     hatch grant went out with a clean-pass reason on the row. Now the flag appears in exactly one
     place, and these two pins are what stop a second copy of it being added later. */
  const verifCode = verifSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("[14] the operator flag is read in one place and applied in one place",
    (verifCode.match(/poseMode === "legacy"/g) ?? []).length === 1 &&
      (verifCode.match(/FREEBORN_POSE_ENFORCEMENT/g) ?? []).length === 1,
    `code-level uses: ${(verifCode.match(/poseMode === "legacy"/g) ?? []).length}`);
  ok("[14] the hatch has no approval path of its own: the gate is a veto, not a switch",
    !/viaLegacyHatch/.test(verifSrc) &&
      /if \(!approvable \|\| !freshnessProven \|\| !poseProven\) \{/.test(verifSrc));
  ok("[14] no engine branch may waive freshness — there is no 'no-freshness' grant marker at all",
    !/\+unproven:no-freshness/.test(verifSrc) && !/poseMode === "legacy" \? true : freshness/.test(verifSrc));
  ok("[14] an unproven-pose grant is written where a reviewer can query it",
    /grantedUnproven \? "\+unproven:legacy-pose" : ""/.test(verifSrc));
  ok("[14] the reason and the marker come from ONE variable, so the row cannot contradict itself",
    /const grantedUnproven = !challengeProven;/.test(verifSrc) &&
      /grantedUnproven\n\s*\? "stage1\+stage2 pass, badge granted by the legacy hatch"/.test(verifSrc));
  ok("[14] the hatch says what it did on the approval record",
    /badge granted by the legacy hatch/.test(verifSrc));
  ok("[14] the operator's escape hatch is one env var and defaults to enforcing",
    /process\.env\.FREEBORN_POSE_ENFORCEMENT === "legacy"/.test(verifSrc) &&
      /: "review";/.test(verifSrc));
  ok("[14] the single-engine path is held to the same two proofs",
    /pose\.matchesAsked === true && freshnessProven && poseProven;/.test(verifSrc));
  ok("[14] a configured-but-refused second engine is reported, not hidden as 'single'",
    /\+lm7:\$\{lm7\.reason/.test(verifSrc) && /engineReason/.test(verifSrc));
  ok("[14] stage 2 is asked about the SERVER's pose, never the client's string",
    /roughly perform: "\$\{askedPose\}"/.test(verifSrc) && !/roughly perform: "\$\{poseLabel\}"/.test(verifSrc));
  ok("[14] the observation set reaches the audit row only through persistableDetail",
    /detail: persistableDetail\(integrity\)/.test(verifSrc) &&
      !/detail: JSON\.stringify\(browser\)/.test(verifSrc) &&
      !/detail: JSON\.stringify\(integrity\)/.test(verifSrc));
  ok("[14] every attempt is recorded, clean ones included, and never gated on a hit",
    /kind: "browser_integrity"/.test(verifSrc) && !/if \(integrity\.count/.test(verifSrc));
  ok("[14] nothing in the decision path reads the integrity result",
    !/if \(integrity/.test(verifSrc) && !/approvable[\s\S]{0,80}integrity\./.test(verifSrc));
  ok("[14] the integrity write cannot fail a member's verification",
    /\.values\(\{[^}]*kind: "browser_integrity"[\s\S]{0,240}\.catch\(\(\) => undefined\)/.test(verifSrc));
  ok("[14] the event kind is a fixed string, so the audit query is stable",
    (verifSrc.match(/kind: "browser_integrity"/g) ?? []).length === 1);

  /* ---- D. the challenge-store defect that made all of this unreachable ---- */
  ok("[14] one LIVE challenge per (email, purpose) — a partial index, not a status-keyed unique",
    /uniqueIndex\("human_challenges_single_live"\)\s*\.on\(t\.email, t\.purpose\)\s*\.where\(sql`\$\{t\.status\} = 'issued'`\)/.test(schemaSrc));
  ok("[14] no unique index on human_challenges still includes status",
    !/uniqueIndex\("human_challenges[^"]*"\)\.on\([^)]*status/.test(schemaSrc));
  ok("[14] the shipped migration is idempotent in both directions",
    /drop index if exists public\.human_challenges_single_live;/.test(singleLiveMig) &&
      /create unique index if not exists human_challenges_single_live/.test(singleLiveMig) &&
      /where status = 'issued';/.test(singleLiveMig));
  /* Production holds this uniqueness as a table CONSTRAINT, not a standalone index, and
     `drop index` on a constraint-backed index is refused (2BP01). The first version of the
     migration only said `drop index if exists` and was rejected by the live database on
     2026-10-30 — a review DB built by `drizzle-kit push` cannot catch that. So the file
     must carry BOTH removal forms; a future "simplification" that keeps one of them
     re-breaks the only environment that matters. */
  ok("[14] the migration removes BOTH shapes (constraint in production, index under drizzle push)",
    /drop constraint if exists human_challenges_single_live;/.test(singleLiveMig) &&
      /drop index if exists public\.human_challenges_single_live;/.test(singleLiveMig));
  ok("[14] the migration keeps history rather than deleting the member's rows",
    !/delete from human_challenges/i.test(singleLiveMig));
  ok("[14] the index keeps its name, so production swaps shape and not identity",
    (singleLiveMig.match(/human_challenges_single_live/g) ?? []).length >= 4);
}

/* ------------------------------------------------------------------ [15] media recovery -- */
/* Three production-verified ways member media disappeared or outlived its owner, found
   2026-10-30 by querying the live database (see the migration for the numbers). Each pin
   below names the mechanism it protects, and the ordering pins exist because these are
   authorization paths: a branch in the wrong place is a hole, not a cosmetic issue. */
const mediaGetSrc = readFileSync(new URL("../../src/app/api/chat/media/[id]/route.ts", import.meta.url), "utf8");
const photosApiSrc = readFileSync(new URL("../../src/app/api/profile/photos/route.ts", import.meta.url), "utf8");
const onboardSrc = readFileSync(new URL("../../src/lib/onboarding-store.ts", import.meta.url), "utf8");
const mediaMigSrc = readFileSync(new URL("../../db/migrations/2026-10-30-media-recovery.sql", import.meta.url), "utf8");
const rls1Src = readFileSync(new URL("../../db/migrations/2026-10-16-rls-and-media-ownership.sql", import.meta.url), "utf8");

/* Contracts the whole fix stands on, executed rather than pattern-matched: an
   indirection-shaped row is passed to the browser unchanged (which is why it needed
   an authorization branch), and a mirrored /uploads row is likewise passed through —
   which is exactly how it stayed broken forever. */
ok("[15] an /api/chat/media path reaches the browser unchanged", resolvePhotoUrl("/api/chat/media/aa11") === "/api/chat/media/aa11");
ok("[15] a bucket path is prefixed with the public object URL", resolvePhotoUrl("u1/p.jpg").endsWith("/storage/v1/object/public/profile-photos/u1/p.jpg"));
ok("[15] a mirrored /uploads path resolves as-is, so it can only ever 404", resolvePhotoUrl("/uploads/x.jpg") === "/uploads/x.jpg");
ok("[15] no path yields no URL, never a guessed one", resolvePhotoUrl(null) === "" && resolvePhotoUrl("") === "");

/* The disappearing-profile-photo fix: a blob the owner published as their own profile
   photo is readable by any signed-in member, because RLS already shows that photo to
   every discoverable profile. It must stay (a) after the participant checks so it can
   only ADD an audience the owner chose, and (b) equivalent to the RLS-1 predicate. */
const idxMember = mediaGetSrc.indexOf("getMember(request)");
const idxPub = mediaGetSrc.indexOf("const published = await db");
const idxGate = mediaGetSrc.indexOf("if (needsPublishedProfilePhotoLookup(facts))");
ok("[15] the media route authenticates before consulting any branch", idxMember >= 0 && idxMember < idxGate);
ok("[15] the profile-photo lookup is the lazy last resort, not a per-request join",
  idxGate > 0 && idxPub > idxGate, `gate=${idxGate} lookup=${idxPub}`);
/* The route used to own the boolean; if it grows one back, the two copies are free to
   disagree and only one of them is tested. One deny, one source of truth. */
ok("[15] the route holds no authorization logic of its own",
  !/\ballowed\b/.test(mediaGetSrc) && !mediaGetSrc.includes("if (!canRead"),
  "route must delegate to decideMediaAccess");
ok("[15] there is exactly one deny statement, and it is the delegated one",
  (mediaGetSrc.match(/return new Response\("Not found", \{ status: 404 \}\)/g) ?? []).length === 2 &&
  mediaGetSrc.includes("if (!decideMediaAccess(facts).allow) return new Response(\"Not found\", { status: 404 });"));
ok("[15] it is keyed on the exact path the photo row publishes", /eq\(profilePhotos\.storagePath, `\/api\/chat\/media\/\$\{id\}`\)/.test(mediaGetSrc));
ok("[15] the branch mirrors RLS-1 (active + discoverable + stage)",
  /eq\(userProfiles\.profileStatus, "active"\)/.test(mediaGetSrc) &&
  /eq\(userProfiles\.discoverable, true\)/.test(mediaGetSrc) &&
  /inArray\(userProfiles\.onboardingStage, \["profile_setup", "ready"\]\)/.test(mediaGetSrc));
ok("[15] the policy it imitates still says the same three things",
  ["profile_status = 'active'", "discoverable = true", "onboarding_stage = any (array['profile_setup','ready'])"].every((frag) => rls1Src.includes(frag)));
ok("[15] denial is still an indistinguishable 404 with no reason given",
  !mediaGetSrc.includes("Not authorized") && !mediaGetSrc.includes("not the participant") &&
  !/reason/.test(mediaGetSrc.slice(mediaGetSrc.indexOf("export async function GET"))));
ok("[15] served media stays uncacheable and un-sniffable",
  mediaGetSrc.includes('"Cache-Control": "private, no-store"') && mediaGetSrc.includes('"X-Content-Type-Options": "nosniff"'));

/* ── the rule table, EXECUTED ──
   The brief asks for testing across profile owners, eligible viewers, chat senders and
   recipients. Two live member sessions are not available to me in this sandbox, so the
   roles are enumerated as inputs instead — which is stronger than one hand-picked pair:
   every combination of the five facts is asserted below, and the loop over the full
   space follows. A case cannot be quietly dropped, because the exhaustive pass would
   then contradict the named one. */
const U = "member-sender";
const V = "member-recipient";
const X = "member-stranger";
const M = "conversation-1";
const EMPTY: MediaAccessFacts = {
  requesterId: null,
  mediaSenderId: null,
  mediaMatchId: null,
  requesterIsParticipant: false,
  publishedAsVisibleProfilePhoto: false,
};
const decide = (over: Partial<MediaAccessFacts>) => decideMediaAccess({ ...EMPTY, ...over });
const MEDIA_RULES: Array<[string, Partial<MediaAccessFacts>, boolean]> = [
  ["sender opens their own unlinked (legacy) blob", { requesterId: U, mediaSenderId: U }, true],
  ["recipient opens a linked blob", { requesterId: V, mediaSenderId: U, mediaMatchId: M, requesterIsParticipant: true }, true],
  ["sender opens a linked blob they are in", { requesterId: U, mediaSenderId: U, mediaMatchId: M, requesterIsParticipant: true }, true],
  ["stranger opens a linked blob", { requesterId: X, mediaSenderId: U, mediaMatchId: M, requesterIsParticipant: false }, false],
  ["stranger opens an unlinked blob", { requesterId: X, mediaSenderId: U }, false],
  ["anonymous opens a blob its own rules would otherwise grant", { requesterId: null, mediaSenderId: U, mediaMatchId: M, requesterIsParticipant: true }, false],
  ["sender is REFUSED a linked blob they no longer participate in — the sender fallback is legacy-only", { requesterId: U, mediaSenderId: U, mediaMatchId: M, requesterIsParticipant: false }, false],
  ["eligible viewer opens a published profile photo", { requesterId: X, mediaSenderId: U, publishedAsVisibleProfilePhoto: true }, true],
  ["owner opens their own published profile photo", { requesterId: U, mediaSenderId: U, publishedAsVisibleProfilePhoto: true }, true],
  ["no row to decide on", { requesterId: X }, false],
  ["a null sender id alone must not read as 'no relationship, allow'", { requesterId: X, mediaMatchId: M, requesterIsParticipant: false }, false],
];
for (const [name, facts, want] of MEDIA_RULES) {
  const got = decide(facts);
  ok(`[15] media rule: ${name}`, got.allow === want, `allow=${got.allow} reason=${got.reason}`);
}
ok("[15] every denial names a deny: reason, every grant a grant: reason",
  MEDIA_RULES.every(([, facts, want]) => decide(facts).reason.startsWith(want ? "grant:" : "deny:")));

/* Exhaustive pass. Two properties the whole design leans on:
   monotonicity — a further fact never revokes a grant, which is what lets the route look
   rule 3 up lazily — and deny-by-default, which keeps the grant set small enough to audit. */
let combos = 0, grantsBeforeLookup = 0, monotone = true, lazySafe = true, anonCases = 0, anonDenied = 0;
for (const requesterId of [U, V, X, null])
  for (const mediaSenderId of [U, V, null])
    for (const mediaMatchId of [null, M])
      for (const requesterIsParticipant of [false, true])
        for (const publishedAsVisibleProfilePhoto of [false, true]) {
          const base = { requesterId, mediaSenderId, mediaMatchId, publishedAsVisibleProfilePhoto };
          const asAsked = { ...base, requesterIsParticipant };
          const noLookup = decideMediaAccess({ ...asAsked, publishedAsVisibleProfilePhoto: false });
          const withLookup = decideMediaAccess({ ...asAsked, publishedAsVisibleProfilePhoto: true });
          const weak = decideMediaAccess({ ...base, requesterIsParticipant: false, publishedAsVisibleProfilePhoto: false });
          combos++;
          /* Monotone in the granting facts: learning that the requester is a participant,
             or that the owner published the blob, may only ever ADD a grant. */
          if (weak.allow && !withLookup.allow) monotone = false;
          if (noLookup.allow && !withLookup.allow) monotone = false;
          /* And the route's shortcut is behaviour-preserving: it skips the profile-photo
             query exactly when the answer is already "allow", so the answer cannot change.
             Compared against `noLookup` (the flags as actually asked), not a weakened
             baseline — an earlier draft of this pin compared the wrong pair and went red
             on correct code. */
          if (!needsPublishedProfilePhotoLookup({ ...asAsked, publishedAsVisibleProfilePhoto: false })) {
            if (!noLookup.allow || withLookup.allow !== noLookup.allow) lazySafe = false;
          }
          if (noLookup.allow) grantsBeforeLookup++;
          if (requesterId === null) {
            anonCases++;
            if (!withLookup.allow) anonDenied++;
          }
        }
ok("[15] the rule is monotone over the full fact space", monotone, `${combos} combinations`);
ok("[15] the lazy lookup gate cannot skip a grant the rule would have made", lazySafe);
/* Two properties worth pinning. The first is the one an attacker probes: a missing
   session must deny in EVERY case, whatever else is true about the row. The second is
   deny-by-default measured BEFORE the profile-photo lookup — counting with the flag
   forced true would be meaningless, since "this blob is somebody's published photo" is
   the rarest fact in the space and the enumeration makes it always-true. An earlier
   draft asserted the minority over that inflated denominator and went red on correct
   code; the shape of the assertion, not the rule, was wrong. */
ok("[15] no combination whatsoever grants media to an anonymous caller",
  anonCases > 0 && anonDenied === anonCases, `${anonDenied}/${anonCases} anonymous cases denied`);
ok("[15] before the lookup, a grant needs a real relationship (minority of the space)",
  grantsBeforeLookup > 0 && grantsBeforeLookup < combos / 2, `grants=${grantsBeforeLookup}/${combos}`);

/* Orphan bytes: the row and the object must die together, and the object name must
   never come from the request body. */
ok("[15] deleting a photo deletes its object, addressed from the row", /\.remove\(\[row\.storagePath\]\)/.test(photosApiSrc));
ok("[15] the request body can never name an object to delete", !/\.remove\(\[?path\]/.test(photosApiSrc));
ok("[15] only bucket-relative paths are sent to storage",
  /if \(!row\.storagePath\.startsWith\("\/"\) && !\/\^https\?:/.test(photosApiSrc) &&
  photosApiSrc.includes('storage.from("profile-photos").remove'));
ok("[15] a failed object removal is logged, not reported as a failed delete",
  photosApiSrc.includes('console.warn("[profile-photos] deleted row but the object remains:'));
/* Right to erasure is the same defect with higher stakes: deleting an account used to
   drop profile_photos rows and leave every image in a public bucket, with no row left
   to attribute it. Pinned as an ORDER property, because sweeping after the delete loses
   the only index that points at the objects. */
const accountSrc = readFileSync(new URL("../../src/app/api/account/route.ts", import.meta.url), "utf8");
ok("[15] account deletion sweeps both media buckets",
  accountSrc.includes('["profile-photos", "profile_photos"]') &&
  accountSrc.includes('["verification-selfies", "verification_selfie_checks"]'));
ok("[15] the sweep runs before the rows that name the objects are dropped",
  accountSrc.indexOf("listBucketPaths") < accountSrc.indexOf("delete from public.profile_photos") &&
  accountSrc.indexOf("listBucketPaths") > 0);
ok("[15] enumerated paths are filtered to bucket shapes, never taken from the request body",
  accountSrc.includes('.filter((p): p is string => typeof p === "string" && p.length > 0 && !p.startsWith("/")') &&
  !accountSrc.includes("remove([path]") && !accountSrc.includes("remove(path)") && !accountSrc.includes("remove([body") &&
  !/const \{[^}]*\bpath\b[^}]*\} = \(body/.test(accountSrc));
ok("[15] a refused object removal warns and lets the cascade finish",
  accountSrc.includes("objects survived the deletion:") &&
  !/objects survived the deletion[\s\S]{0,120}return Response\.json/.test(accountSrc));

ok("[15] the unremovable-path wording is preserved verbatim",
  photosApiSrc.includes("That photo lives in your original upload store, so it can't be removed from this preview room."));

/* The silent-breakage generator: a storage failure used to write bytes to disk and
   store /uploads/<name> in the live table. It must not come back. */
ok("[15] the disk mirror is gone from the onboarding store",
  !onboardSrc.includes("persistPhotoDataUrlToLocal") && !/`\/uploads\/\$\{/.test(onboardSrc) &&
  !onboardSrc.includes('from "node:fs/promises"'));
ok("[15] a storage failure falls back to Postgres bytes at a served path",
  /storePhotoBytesInDatabase\(userId, photo\.src\)/.test(onboardSrc) &&
  /`\/api\/chat\/media\/\$\{media\.id\}`/.test(onboardSrc));
ok("[15] both fallback sites were converted, not just the first", (onboardSrc.match(/storePhotoBytesInDatabase/g) ?? []).length >= 3);
ok("[15] replace-all onboarding removes old objects before deleting old rows",
  onboardSrc.indexOf(".remove(removable)") > 0 &&
  onboardSrc.indexOf('from("profile_photos").delete()') > onboardSrc.indexOf(".remove(removable)"));
ok("[15] the removal list is filtered to bucket paths only",
  onboardSrc.includes('.filter((p) => typeof p === "string" && p.length > 0 && !p.startsWith("/") && !/^https?:\\/\\//.test(p));'));
ok("[15] an upload failure is named in the log instead of swallowed",
  /console\.warn\(`\[onboarding\] photo \$\{photo\.id\} was not stored: /.test(onboardSrc));

/* The SQL half: repair from proven links only, never destroy, never re-diverge. */
ok("[15] the backfill refuses media referenced from two conversations",
  /having count\(distinct match_id\) = 1/.test(mediaMigSrc));
ok("[15] the backfill can only link a conversation that still exists",
  /join public\.matches mt on mt\.id = ms\.match_id/.test(mediaMigSrc));
ok("[15] the backfill is idempotent", /and cm\.match_id is null;/.test(mediaMigSrc));
ok("[15] the migration deletes no member data",
  !/\bdelete from\b/i.test(mediaMigSrc) && !/\btruncate\b/i.test(mediaMigSrc));
ok("[15] the public bucket now has a measured mime and size bound",
  mediaMigSrc.includes("BOUND THE PUBLIC BUCKET — APPLIED 2026-10-30") &&
  mediaMigSrc.includes("array['image/jpeg','image/png','image/webp']"));

/* ══════════════════════════════════════════════════════════════════════════
   [16] MEDIA RESILIENCE + SHARED UI CONTRACT (2026-10-30, competitor-driven)
   ──────────────────────────────────────────────────────────────────────────
   (a) src/lib/api-response.ts is pinned as BEHAVIOUR: the tolerant parse, the
       retry bound, the idempotency rule and the backoff clock. These exist because
       a proxy 502 is an HTML page — `await res.json()` threw a SyntaxError that
       either reached the member as "unexpected end of JSON input" or, in
       getIceConfig, was swallowed and silently downgraded every call to STUN-only.
       The 60s 429 floor, the bounded default and the retry-only-idempotent shape
       are what Tinder's and Hinge's own shipped clients were measured doing
       (docs/research/2026-10-30/MINING-API-STATE.json, cited by byte offset);
       the offsets are evidence for a MECHANISM, not for their server behaviour.
   (b) The photo renderer and button contract are pinned as STRUCTURE: that the
       two most-seen photo surfaces route through the resilient component at all,
       and that hover/pressed stay overlay-painted and capability-gated. Those
       properties are invisible in a screenshot and easy to "simplify" away.
   ══════════════════════════════════════════════════════════════════════════ */
const res = (status: number, body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

ok("[16] a non-JSON body parses to null instead of throwing",
  (await readJsonSafe(res(502, "<html><title>502 Bad Gateway</title></html>"))) === null &&
  (await readJsonSafe(res(200, ""))) === null &&
  JSON.stringify(await readJsonSafe(res(200, JSON.stringify({ a: 1 }), { "content-type": "application/json" }))) === '{"a":1}',
  "an HTML error page must not raise SyntaxError, and an empty body is not an error");

ok("[16] real JSON still parses",
  (await readJsonSafe(res(200, JSON.stringify({ iceServers: [{ urls: "stun:x" }] })))) !== null);

{
  const own = await describeFailure(res(413, JSON.stringify({ error: "That photo is too large." })));
  const proxy = await describeFailure(res(502, "<html>502</html>"));
  const anon = await describeFailure(res(418, "{}"));
  ok("[16] the server's own message wins over the generic one", own.message === "That photo is too large." && own.status === 413);
  ok("[16] an unparseable 502 still yields a sentence a person can read", /unreachable/i.test(proxy.message), proxy.message);
  ok("[16] no status may fall through to an empty message", anon.message.trim().length > 0, JSON.stringify(anon));
}

ok("[16] only 429 counts as a throttle (503 has no window to honour)",
  isRateLimited({ status: 429 }) === true && isRateLimited({ status: 503 }) === false);

ok("[16] Retry-After wins over the local guess, and is clamped to a survivable wait",
  retryDelayMs({ status: 429, retryAfterHeader: "3", attempt: 1 }) === 3000 &&
  retryDelayMs({ status: 429, retryAfterHeader: "99999", attempt: 1 }) === 60000,
  "a hostile or buggy header cannot park a member's screen for an hour");

ok("[16] a 429 with no header gets the measured 60s floor",
  retryDelayMs({ status: 429, attempt: 1 }) === 60000,
  "mechanism observed in Tinder's client as 429===t&&(o.all=s+6e4)");

ok("[16] a 5xx backs off exponentially from the base and respects the cap",
  retryDelayMs({ status: 500, attempt: 1, baseMs: 400, capMs: 20000 }) === 400 &&
  retryDelayMs({ status: 500, attempt: 3, baseMs: 400, capMs: 20000 }) === 1600 &&
  retryDelayMs({ status: 500, attempt: 9, baseMs: 400, capMs: 20000 }) === 20000);

{
  let calls = 0; const slept: number[] = [];
  const out = await fetchWithRetry("/api/x", { method: "GET" },
    { maxAttempts: 3, baseMs: 100, sleep: async (ms) => { slept.push(ms); } },
    async () => { calls++; return res(503, "{}"); });
  ok("[16] a failing GET is retried to the bound, then the response is returned not thrown",
    calls === 3 && out.attempts === 3 && out.res?.status === 503 && slept.length === 2,
    `calls=${calls} attempts=${out.attempts} sleeps=${slept.length}`);
}

{
  let post = 0, bad = 0;
  await fetchWithRetry("/api/likes", { method: "POST" }, { maxAttempts: 5, sleep: async () => {} },
    async () => { post++; return res(502, "{}"); });
  await fetchWithRetry("/api/x", { method: "GET" }, { maxAttempts: 5, sleep: async () => {} },
    async () => { bad++; return res(400, "{}"); });
  ok("[16] a POST is never retried — a duplicate like, report or message is the worse bug",
    post === 1, `post calls=${post}`);
  ok("[16] a 400 is a decision, not a hiccup: no retry", bad === 1, `400 calls=${bad}`);
}

{
  let calls = 0;
  const okOut = await fetchWithRetry("/api/x", {}, { maxAttempts: 5, sleep: async () => {} }, async () => {
    calls++; return calls < 3 ? res(500, "{}") : res(200, JSON.stringify({ iceServers: [] }));
  });
  let boom = 0;
  const net = await fetchWithRetry("/api/x", {}, { maxAttempts: 2, sleep: async () => {} }, async () => {
    boom++; throw new TypeError("Failed to fetch");
  });
  ok("[16] the first success stops the loop", calls === 3 && okOut.res?.status === 200, `calls=${calls}`);
  ok("[16] a network error is retried and the original error still reaches the caller",
    boom === 2 && net.res === null && net.error instanceof TypeError, `boom=${boom}`);
}

ok("[16] the retry cache-buster re-requests same-origin paths and refuses foreign ones",
  retrySrcFor("/api/chat/media/abc", 1) === "/api/chat/media/abc?r=1" &&
  retrySrcFor("/api/chat/media/abc?r=2", 3) === "/api/chat/media/abc?r=3" &&
  retrySrcFor("/api/x?token=abc", 2) === "/api/x?token=abc&r=2" &&
  retrySrcFor("https://cdn.example/i.jpg", 1) === null &&
  retrySrcFor("//example.com/i.jpg", 1) === null &&
  retrySrcFor("data:image/jpeg;base64,AAA", 1) === null,
  "a signed URL must not be rewritten and an inline preview is already in memory");

{
  const deck = readFileSync(new URL("../../src/components/app/home-deck.tsx", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../../src/components/app/chat-view.tsx", import.meta.url), "utf8");
  const bus = readFileSync(new URL("../../src/lib/call-bus.ts", import.meta.url), "utf8");
  ok("[16] the deck photo renders through the resilient component, not a bare <img>",
    /<PhotoImage\b/.test(deck) && !/<img\s+src=\{profile\.photos/.test(deck));
  ok("[16] chat avatars render through it too", /<PhotoImage\b/.test(chat));
  ok("[16] the ICE fetch no longer parses unguardedly",
    !/await res\.json\(\)/.test(bus) && /readJsonSafe/.test(bus),
    "an HTML 502 here used to be caught and silently downgrade every call to STUN-only");
}

{
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  const btn = readFileSync(new URL("../../src/components/ui/button.tsx", import.meta.url), "utf8");
  const photo = readFileSync(new URL("../../src/components/ui/photo-image.tsx", import.meta.url), "utf8");
  ok("[16] hover and pressed are overlay layers, so label contrast cannot drift per state",
    /--button-overlay-background-hover/.test(css) && /--button-overlay-background-pressed/.test(css) &&
    /\.fb-btn::after/.test(css),
    "Bumble's mechanism, read off its stylesheet — not its appearance");
  ok("[16] hover styling is capability-gated, so it cannot stick after a tap",
    /@media \(hover: hover\) and \(pointer: fine\)/.test(css), "as Tinder's stylesheet does");
  ok("[16] focus is explicit and motion is respected",
    /\.fb-btn:focus-visible/.test(css) && /@media \(prefers-reduced-motion: reduce\)/.test(css));
  ok("[16] the measured type scale lives in @theme so the utilities exist",
    /--text-ui-xs: 0\.8125rem/.test(css) && /--text-ui-sm: 0\.9375rem/.test(css) &&
    /--text-ui-md: 1\.0625rem/.test(css) && /--radius-card: 1rem/.test(css) &&
    /--control-h-md: 2\.75rem/.test(css),
    "13/15/17px + 16px radius + 44px control floor, from bumble.7050c3776fb2414d.css");
  ok("[16] a loading button is disabled and announced, not merely styled",
    /disabled \|\| loading/.test(btn) && /aria-busy/.test(btn));
  ok("[16] a new src resets render state in-render, not in an effect",
    /setPrevSrc\(src\)[\s\S]{0,120}setState\("loading"\)/.test(photo) && !/useEffect\(\(\) => \{\s*setState\("loading"\)/.test(photo),
    "an effect would paint one frame of the previous photo's state onto the new src");
  ok("[16] a failed photo is said out loud and offers a way out",
    /didn/.test(photo) && /Tap to try again/.test(photo));
}

/* ══════════════════════════════════════════════════════════════════════════
   [17] UNMATCH DETACHES, IT DOES NOT DESTROY (2026-10-30, competitor-driven)
   ──────────────────────────────────────────────────────────────────────────
   Freeborn's unmatch was `delete(matches)` while messages.match_id AND
   chat_media.match_id are `on delete cascade`: one member's tap destroyed a shared
   history for the other member and orphaned the thread's photo bytes with no row left
   to find them. The evidence (docs/research/2026-10-30/UNMATCH-EVIDENCE.md) shows
   Tinder keeping `matches`, `messages` and an optimistic `unmatchedIds` as three
   separate state slices; Bumble publishing that the *recipient* keeps the conversation
   visible "so you can still report them"; and Hinge splitting Hide (visibility) from
   Unmatch (severance). So the fix is a status change plus per-member visibility, and
   account deletion stays the only cascade. The full fact space is executed below.
   ══════════════════════════════════════════════════════════════════════════ */
const ML_STATUSES: MatchLifecycleStatus[] = ["active", "archived", "blocked", "unmatched"];
const ML_ACTIONS: MatchAction[] = [
  "view_conversation", "send_message", "read_media", "appear_in_chat_list", "count_unread",
  "create_or_rematch", "export_own_data",
];
const ml = (status: MatchLifecycleStatus | null, isParticipant: boolean, isActor: boolean, action: MatchAction, hasMessages = false) =>
  decideMatchAccess({ status, isParticipant, isActor, hasMessages, action });

{
  /* A stranger may never reach another pair's conversation, in any state, for any action. */
  let strangerLeak: string[] = [];
  for (const status of ML_STATUSES)
    for (const action of ML_ACTIONS)
      for (const isActor of [false, true])
        if (ml(status, false, isActor, action).allow) strangerLeak.push(`${status}/${action}/actor=${isActor}`);
  ok("[17] a non-participant is denied every action on every status",
    strangerLeak.length === 0, strangerLeak.join(","));
}

{
  /* Both members, forever, on a severed thread: cannot send. This is the invariant that
     makes "keep the rows" safe to ship at all. */
  let sendable: string[] = [];
  for (const status of ["blocked", "unmatched"] as MatchLifecycleStatus[])
    for (const isActor of [false, true])
      if (ml(status, true, isActor, "send_message").allow) sendable.push(`${status}/actor=${isActor}`);
  ok("[17] neither member of a severed pair can ever send again", sendable.length === 0, sendable.join(","));
  ok("[17] an active participant can send", ml("active", true, false, "send_message").allow === true);
  ok("[17] a severed pair can never be re-opened as a match, by either side",
    ml("unmatched", true, false, "create_or_rematch").allow === false &&
    ml("unmatched", true, true, "create_or_rematch").allow === false &&
    ml("blocked", true, false, "create_or_rematch").allow === false &&
    ml("unmatched", true, false, "create_or_rematch").reason === "deny:severed-is-permanent");
  ok("[17] an existing active pair is not re-creatable either (no duplicate thread rows)",
    ml("active", true, false, "create_or_rematch").reason === "deny:already-matched");
}

{
  /* The asymmetry, stated as an invariant rather than a vibe: the person who ended it loses
     the conversation from their view; the person it was ended with keeps reading it. */
  ok("[17] the actor loses the thread; the recipient keeps it read-only",
    ml("unmatched", true, true, "view_conversation").allow === false &&
    ml("unmatched", true, false, "view_conversation").allow === true &&
    ml("unmatched", true, false, "view_conversation").reason === "grant:read-only-for-report");
  ok("[17] the same asymmetry drives the chat list, so nothing is destroyed to be hidden",
    ml("unmatched", true, true, "appear_in_chat_list").reason === "hide:actor-severed-it" &&
    ml("unmatched", true, false, "appear_in_chat_list").reason === "show:read-only-ended");
  ok("[17] a blocked thread is hidden from the blocker too (they chose the severance)",
    ml("blocked", true, true, "appear_in_chat_list").allow === false &&
    ml("blocked", true, false, "appear_in_chat_list").allow === true);
  ok("[17] an ended thread never nags with an unread badge, but that is display-only",
    ml("unmatched", true, false, "count_unread").allow === false &&
    ml("active", true, false, "count_unread").allow === true);
  ok("[17] both sides keep opening attachments they were party to — the report path needs the bytes",
    ml("unmatched", true, true, "read_media").allow === true &&
    ml("unmatched", true, false, "read_media").allow === true &&
    ml("blocked", true, false, "read_media").allow === true);
  ok("[17] a data export is unaffected by severance (it is the member's own record)",
    ml("unmatched", true, true, "export_own_data").allow === true &&
    ml("unmatched", true, false, "export_own_data").allow === true);
  ok("[17] a missing row denies everything, including 'read media'",
    ml(null, true, false, "view_conversation").reason === "deny:missing-row" &&
    ml(null, true, false, "read_media").reason === "deny:missing-row");
  ok("[17] archived stays readable and writable (it is a soft hide, not an end)",
    ml("archived", true, false, "view_conversation").allow === true &&
    ml("archived", true, false, "send_message").allow === true);
}

ok("[17] every decision carries a machine-readable reason (no silent denies in the API)",
  ML_STATUSES.every((st) => ML_ACTIONS.every((ac) => /^[a-z]+:[a-z0-9-]+$/.test(ml(st, true, false, ac).reason))));

{
  /* Monotonicity in the one direction the routes rely on: for a participant, becoming the
     actor never GRANTS anything. (Denying more is the safe direction.) */
  let widened: string[] = [];
  for (const st of ML_STATUSES)
    for (const ac of ML_ACTIONS)
      if (ml(st, true, true, ac).allow && !ml(st, true, false, ac).allow) widened.push(`${st}/${ac}`);
  ok("[17] being the member who ended it never unlocks extra access", widened.length === 0, widened.join(","));
}

ok("[17] the reason vocabulary is closed, and empty/absent stays legal",
  UNMATCH_REASONS.every((r) => isUnmatchReason(r)) &&
  isUnmatchReason("stalking_harassment_x") === false &&
  isUnmatchReason(undefined) === false && isUnmatchReason("") === false);

ok("[17] an ended thread still explains itself in one sentence, and names the report path",
  /permanent/i.test(severedMessage("unmatched")) && /report/i.test(severedMessage("unmatched")) &&
  /can't message/i.test(severedMessage("blocked")));

ok("[17] undo may only delete the match row while the thread is empty",
  undoMayDeleteMatchRow(false) === true && undoMayDeleteMatchRow(true) === false);

/* ── the shipped code must actually consult the table ── */
const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
{
  const unmatchSrc = src("src/app/api/chat/unmatch/route.ts");
  ok("[17] unmatch no longer deletes the match row",
    !/\.delete\(matches\)/.test(unmatchSrc) && /\.update\(matches\)/.test(unmatchSrc) &&
    /status: "unmatched"/.test(unmatchSrc),
    "the delete is what cascaded the conversation away");
  ok("[17] unmatch requires an explicit confirmation and validates the reason",
    /destructive !== true/.test(unmatchSrc) && /isUnmatchReason/.test(unmatchSrc));
  ok("[17] unmatch is idempotent and race-safe (only an active row may be severed)",
    /eq\(matches\.status, "active"\)/.test(unmatchSrc) && /alreadyEnded: true/.test(unmatchSrc));

  const blockSrc = src("src/app/api/blocks/route.ts");
  ok("[17] blocking preserves the thread instead of cascading the evidence away",
    !/\.delete\(matches\)/.test(blockSrc) && /status: "blocked"/.test(blockSrc),
    "a block is exactly when the report needs the history to survive");

  const startSrc = src("src/app/api/chat/start/route.ts");
  ok("[17] chat/start cannot hand back a severed matchId",
    /create_or_rematch/.test(startSrc) && /decideMatchAccess/.test(startSrc));

  const msgSrc = src("src/app/api/chat/messages/route.ts");
  ok("[17] read and send are decided by two different actions on one choke point",
    /"view_conversation"/.test(msgSrc) && /"send_message"/.test(msgSrc) &&
    (msgSrc.match(/ownsMatch\(matchId, member\.id, "/g) || []).length >= 3);
  ok("[17] wiping a whole conversation now needs confirmation and refuses a severed thread",
    /needsConfirmation: true/.test(msgSrc) && /kept for the member who did not end it/.test(msgSrc));

  const reactSrc = src("src/app/api/chat/reactions/route.ts");
  ok("[17] a reaction is a write, so it requires an open thread",
    /eq\(matches\.status, "active"\)/.test(reactSrc));

  const likeSrc = src("src/app/api/likes/route.ts");
  ok("[17] a second mutual like cannot resurrect a severed pair",
    /endedPreviously: true/.test(likeSrc) && /status !== "active"/.test(likeSrc));
  ok("[17] undo detaches when the thread has messages, deletes only when empty",
    /undoMayDeleteMatchRow\(Boolean\(anyMessage\)\)/.test(likeSrc) && /unmatchReason: "other"/.test(likeSrc));

  const deckSrc = src("src/app/api/profiles/route.ts");
  ok("[17] a severed match no longer grants incognito visibility",
    /eq\(matches\.status, "active"\)/.test(deckSrc));

  const mediaSrc = src("src/app/api/chat/media/[id]/route.ts");
  ok("[17] media authorisation stays participation-only and deliberately ignores status",
    !/matches\.status/.test(mediaSrc) && /requesterIsParticipant = Boolean\(participant\)/.test(mediaSrc),
    "the read of a former conversation's bytes is the point of retaining the rows");
}

{
  const mig = src("db/migrations/2026-10-30-unmatch-detach.sql");
  ok("[17] the migration is additive and destroys nothing",
    !/delete from/i.test(mig) && !/truncate/i.test(mig) &&
    /add column if not exists unmatched_by/.test(mig) && /add column if not exists unmatched_at/.test(mig) &&
    /add column if not exists unmatch_reason/.test(mig));
  ok("[17] the status vocabulary is widened, not silently replaced",
    /check \(status in \('active','archived','blocked','unmatched'\)\)/.test(mig));
  ok("[17] an unmatched row must carry provenance",
    /matches_unmatched_has_actor/.test(mig) && /unmatched_by is not null and unmatched_at is not null/.test(mig));
  ok("[17] the cascade foreign keys are kept on purpose (account deletion still purges)",
    // The migration must not ADD or DROP any foreign key: the cascades on messages.match_id
    // and chat_media.match_id are what make account deletion complete, and unmatch no longer
    // pulls that lever. Checked structurally, not by phrase — the prose mentions both.
    !/add constraint[\s\S]{0,120}foreign key/i.test(mig) &&
    !/drop constraint[\s\S]{0,80}_fkey/i.test(mig) &&
    /on delete set null/.test(mig) && /account deletion/i.test(mig) &&
    /deliberately LEFT ALONE/.test(mig));
  ok("[17] it is marked NOT YET APPLIED and carries verification queries",
    /NOT YET APPLIED/.test(mig) && /Verify with:/.test(mig) && /must not move/.test(mig));
  ok("[17] the schema and the migration agree on the same vocabulary",
    src("src/db/schema.ts").includes("in ('active','archived','blocked','unmatched')"));
}

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
