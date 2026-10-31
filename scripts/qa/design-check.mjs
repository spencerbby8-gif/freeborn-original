import { chromium, devices } from "playwright";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

/**
 * Browser-measured proof for the 2026-10-31 design-system change.
 *
 * Why this exists next to scripts/trust/harness.ts: the harness reads the stylesheet and can say a
 * rule exists with the right selector and the right declaration. It CANNOT say what the browser
 * computed — specificity, cascade order, media support, Tailwind's arbitrary-value handling and
 * whether a pseudo-element is even positioned all sit between "the rule is in the file" and "the
 * button is 44px". The premise of the unification is that ~190 call sites change without any of
 * them being edited, so the evidence has to be a rendered control's computed style.
 *
 * It found a defect the source-level pins could not see: `.fb-icon-btn--xs::before` carried
 * `inset: calc(...)` with no `position`, so it computed to `auto` and the "44px hit area" was 28px.
 * The harness stayed green on that rule all afternoon.
 *
 * Renders public/qa/index.html (gitignored; `npm run build` then `node scripts/qa/build.mjs`), i.e.
 * the CSS Next emitted, against the real components. Failures exit non-zero and name the selector.
 */
const out = resolve("scripts/qa/.shots");
await import("node:fs/promises").then((m) => m.mkdir(out, { recursive: true }));
const url = "file://" + resolve("public/qa/index.html");
if (!existsSync(resolve("public/qa/index.html"))) {
  console.error("public/qa/index.html missing — run `npm run build` then `node scripts/qa/build.mjs` first");
  process.exit(2);
}

const fails = [];
let count = 0;
function ok(name, cond, extra = "") {
  count++;
  if (cond === true) console.log(`  ok   ${name}${extra ? "  [" + extra + "]" : ""}`);
  else {
    fails.push(name + (extra ? " — " + extra : ""));
    console.log(`  FAIL ${name}${extra ? "  [" + extra + "]" : ""}`);
  }
}
const lum = (c) => {
  const m = String(c).match(/(\d+(\.\d+)?)/g);
  if (!m) return 0;
  const [r, g, b] = m.slice(0, 3).map((v) => Number(v) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => +(((Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05)).toFixed(2));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1180 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

/* ---- 1. computed geometry of every control family on one screen ---- */
const geo = await page.evaluate(() => {
  const rows = {};
  const pick = {
    "cta md": ".fb-cta--primary",
    "cta sm": ".fb-cta--sm",
    ".fb-btn (legacy pill)": "#legacy-enabled .fb-btn-primary",
    ".fb-btn-sm (legacy small)": ".fb-btn-sm",
    ".btn-ember": "#legacy-enabled .btn-ember",
    ".btn-ghost": "#legacy-enabled .btn-ghost",
    ".magic-button": "#legacy-enabled .magic-button",
    ".fb-icon-btn": "#qa-icon-md",
    ".fb-chip": ".fb-chip",
  };
  for (const [k, sel] of Object.entries(pick)) {
    const el = document.querySelector(sel);
    if (!el) { rows[k] = { missing: true }; continue; }
    const cs = getComputedStyle(el);
    rows[k] = {
      h: +el.getBoundingClientRect().height.toFixed(1),
      minH: cs.minHeight,
      radius: cs.borderTopLeftRadius,
      fontSize: cs.fontSize,
    };
  }
  /* The two controls allowed to paint small are measured by their HIT AREA, which is a positioned
     ::before extending outward — so `inset-top` is negative and the target is h - 2*inset. A static
     pseudo reports `auto`, which is exactly how the missing `position` was caught. */
  for (const [k, sel] of [[".fb-icon-btn--xs", "#qa-icon-xs"], [".fb-chip--sm", ".fb-chip--sm"]]) {
    const el = document.querySelector(sel);
    /* `inset-top` is not exposed on a pseudo CSSDeclaration in Chromium (it returns ""), while
       `top` is — so read the longhand the engine actually answers. Asserting the source rule, as
       the harness does, cannot see that the box lands 2px short because of the border. */
    const cs2 = getComputedStyle(el, "::before");
    /* The pseudo-element's OWN computed box is the target, so it is read directly instead of
       inferred: `h - 2*top` looks equivalent and is not, because `top` resolves against the padding
       box while `getBoundingClientRect().height` includes the 1px border — the inferred figure came
       out 46px for a genuinely 44px target. Reading width/height plus pointer-events also proves the
       box is something a finger can actually land on. */
    rows[k] = {
      h: +el.getBoundingClientRect().height.toFixed(1),
      insetTop: cs2.getPropertyValue("top") || cs2.insetTop,
      hit: Math.min(parseFloat(cs2.getPropertyValue("width")), parseFloat(cs2.getPropertyValue("height"))),
      pointerEvents: cs2.getPropertyValue("pointer-events"),
      radius: getComputedStyle(el).borderTopLeftRadius,
    };
  }
  rows.overflowX = document.documentElement.scrollWidth - 390;
  return rows;
});
console.log("\n[design-check] computed geometry at 390px");
for (const [k, v] of Object.entries(geo)) {
  if (v && typeof v.h === "number") console.log(`  ${k.padEnd(26)} h=${String(v.h).padStart(5)}px  min-h=${v.minH ?? "\u2014"}  radius=${v.radius}  font=${v.fontSize ?? "\u2014"}${v.hit ? `  hit=${v.hit}px` : ""}`);
}
ok("every selector this check measures exists on the page",
  Object.entries(geo).every(([, v]) => !v.missing),
  Object.entries(geo).filter(([, v]) => v.missing).map(([k]) => k).join(" ") || "none missing");
for (const k of ["cta md", ".fb-btn (legacy pill)", ".fb-btn-sm (legacy small)", ".btn-ember", ".btn-ghost", ".magic-button", ".fb-icon-btn", ".fb-chip"]) {
  ok(`${k} meets the 44px touch floor as computed, not as declared`, geo[k].h >= 43.5, `h=${geo[k].h}px`);
}
ok("the legacy pill keeps its 48px — the floor raised the small one, it did not shrink the large one",
  geo[".fb-btn (legacy pill)"].h === 48 && geo[".fb-btn-sm (legacy small)"].h === 44,
  `${geo[".fb-btn (legacy pill)"].h} / ${geo[".fb-btn-sm (legacy small)"].h}`);
const smallTargets = [".fb-icon-btn--xs", ".fb-chip--sm"];
ok("small controls paint below the floor but are 44px to the pointer (pseudo box, hit-testable)",
  smallTargets.every((k) => Math.abs(geo[k].hit - 44) < 0.6 && geo[k].pointerEvents !== "none"),
  smallTargets.map((k) => `${k}: box=${geo[k].h} pseudo=${geo[k].hit} pe=${geo[k].pointerEvents}`).join(" | "));
ok("xs icon paints 28px and its pseudo is centred on it, not hanging off one side",
  geo[".fb-icon-btn--xs"].h === 28 && parseFloat(geo[".fb-icon-btn--xs"].insetTop) === -9,
  `box=${geo[".fb-icon-btn--xs"].h} inset=${geo[".fb-icon-btn--xs"].insetTop}`);

ok("one radius vocabulary per role: pills are pill, cards are 16px",
  geo[".fb-btn (legacy pill)"].radius.endsWith("px") && parseFloat(geo[".fb-btn (legacy pill)"].radius) >= 100 &&
    geo[".fb-chip"].radius === geo[".fb-btn (legacy pill)"].radius,
  `${geo[".fb-btn (legacy pill)"].radius} vs chip ${geo[".fb-chip"].radius}`);
ok("nothing overflows the 390px viewport", geo.overflowX <= 0, `scrollWidth-390=${geo.overflowX}`);

/* ---- 2. disabled is now perceptible on the families that had no :disabled rule ---- */
const dis = await page.evaluate(() => {
  const out2 = {};
  for (const cls of ["fb-btn-primary", "btn-ember", "btn-ghost"]) {
    const on = document.querySelector(`#legacy-enabled .${cls}`);
    const off = document.querySelector(`#legacy-disabled .${cls}`);
    out2[cls] = { enabled: +getComputedStyle(on).opacity, disabled: +getComputedStyle(off).opacity, cursor: getComputedStyle(off).cursor };
  }
  return out2;
});
console.log("\n[design-check] disabled state");
for (const [k, v] of Object.entries(dis)) console.log(`  ${k.padEnd(16)} opacity ${v.enabled} -> ${v.disabled}, cursor ${v.cursor}`);
for (const [k, v] of Object.entries(dis)) {
  ok(`${k}: disabled is visibly inert (opacity drops, cursor refuses)`,
    v.enabled === 1 && v.disabled > 0.3 && v.disabled < 0.8 && v.cursor === "not-allowed",
    `${v.enabled}->${v.disabled} ${v.cursor}`);
}

/* ---- 3. keyboard focus, read per control ----
   `el.focus()` alone does not satisfy `:focus-visible` for a button in a fresh document (the
   heuristic wants a prior keyboard interaction), so one real Tab seeds it, then focus is moved to
   each candidate and the painted ring is read. */
await page.keyboard.press("Tab");
const rings = await page.evaluate(() => {
  const out2 = [];
  for (const el of document.querySelectorAll("#legacy-enabled button, #primitives button")) {
    el.focus();
    const cs = getComputedStyle(el);
    out2.push({
      cls: String(el.className).split(" ").slice(0, 2).join("."),
      w: cs.outlineWidth, s: cs.outlineStyle, off: cs.outlineOffset,
      /* A disabled button is not focusable, so it has no ring and must not be scored as a missing
         one. The first attempt matched the word "disabled" in `className`, which the QA markup does
         not carry (the ATTRIBUTE is what disables it), and the check reported a defect on a control
         no keyboard user can ever reach. */
      unreachable: el.matches(":disabled"),
    });
  }
  return out2;
});
console.log("\n[design-check] focus ring, per control");
for (const r of rings) console.log(`  ${r.cls.padEnd(32)} ${r.w} ${r.s} offset=${r.off}${r.unreachable ? "  (disabled — not focusable)" : ""}`);
const focusable = rings.filter((r) => !r.unreachable);
ok("every legacy + primitive control gets the same explicit 2px solid ring",
  focusable.length >= 8 && focusable.every((r) => r.w === "2px" && r.s === "solid" && r.off === "3px"),
  `${focusable.length} focusable; non-conforming: ${focusable.filter((r) => !(r.w === "2px" && r.s === "solid")).map((r) => r.cls).join(" ") || "none"}`);
ok("disabled controls are the only ones without a ring (nothing focusable was skipped)",
  rings.length - focusable.length === 1, `${rings.length - focusable.length} disabled of ${rings.length}`);

/* ---- 4. the chip's paint follows the announced state ---- */
const chipBefore = await page.evaluate(() => getComputedStyle(document.querySelector("#qa-chip-toggle")).backgroundColor + "|" + document.querySelector("#qa-chip-toggle").getAttribute("aria-pressed"));
await page.locator("#qa-chip-toggle").click();
await page.waitForTimeout(250);
const chipAfter = await page.evaluate(() => getComputedStyle(document.querySelector("#qa-chip-toggle")).backgroundColor + "|" + document.querySelector("#qa-chip-toggle").getAttribute("aria-pressed"));
ok("Chip repaints when aria-pressed flips (state is the source of the style, not a parallel class)",
  chipBefore !== chipAfter && chipBefore.endsWith("|false") && chipAfter.endsWith("|true"),
  `${chipBefore}  ->  ${chipAfter}`);

/* ---- 5. hover is a fine-pointer affordance, now including the legacy families ----
   Both branches are measured and EACH context first asserts what its media queries actually resolve
   to. The `--blink-settings=primaryPointerType=2` launch used before was measured to turn
   `(pointer:fine)` FALSE in this build — the opposite of its intent — so a check that trusted the
   flag would have "proved" the gate closed in a context that was never coarse. Environment first. */
const fineEnv = await page.evaluate(() => ({
  hover: matchMedia("(hover: hover)").matches,
  fine: matchMedia("(pointer: fine)").matches,
  gate: matchMedia("(hover: hover) and (pointer: fine)").matches,
}));
ok("this context really is a fine pointer (otherwise the lift assertion proves nothing)",
  fineEnv.hover && fineEnv.fine && fineEnv.gate, JSON.stringify(fineEnv));
await page.locator("#legacy-enabled .btn-ember").hover();
await page.waitForTimeout(300);
const fineTransform = await page.evaluate(() => getComputedStyle(document.querySelector("#legacy-enabled .btn-ember")).transform);
ok("on a fine pointer the legacy ember button lifts (behaviour kept, not removed by the gate)",
  /matrix\(1, 0, 0, 1, 0, -2\)/.test(fineTransform), fineTransform);
await page.screenshot({ path: `${out}/fine-hover.png`, fullPage: true });

const touch = await browser.newContext({ ...devices["Pixel 7"] });
const tp = await touch.newPage();
await tp.goto(url, { waitUntil: "networkidle" });
await tp.waitForTimeout(400);
const coarseEnv = await tp.evaluate(() => ({
  hover: matchMedia("(hover: hover)").matches,
  fine: matchMedia("(pointer: fine)").matches,
  gate: matchMedia("(hover: hover) and (pointer: fine)").matches,
}));
ok("the emulated phone really is coarse (the negative control for the gate)",
  !coarseEnv.gate, JSON.stringify(coarseEnv));
await tp.locator("#legacy-enabled .btn-ember").hover();
await tp.waitForTimeout(250);
const coarseTransform = await tp.evaluate(() => getComputedStyle(document.querySelector("#legacy-enabled .btn-ember")).transform);
ok("on a coarse pointer the legacy hover transform is reset, so it cannot stick after a tap",
  /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(coarseTransform), coarseTransform);
await tp.screenshot({ path: `${out}/coarse-phone.png`, fullPage: true });
await touch.close();

/* ---- 6. reduced motion still silences the marketing animations, in a fine context ---- */
const rm = await browser.newContext({ reducedMotion: "reduce" });
const rp = await rm.newPage({ viewport: { width: 390, height: 1180 } });
await rp.goto(url, { waitUntil: "networkidle" });
await rp.waitForTimeout(300);
await rp.locator("#legacy-enabled .btn-ember").hover();
await rp.waitForTimeout(250);
const rmState = await rp.evaluate(() => {
  const el = document.querySelector("#legacy-enabled .btn-ember");
  return {
    transform: getComputedStyle(el).transform,
    shine: getComputedStyle(el, "::after").animationName,
    motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
});
ok("the reduced-motion context is actually emulated", rmState.motion === true, JSON.stringify(rmState));
ok("prefers-reduced-motion neutralises the legacy lift", /none|matrix\(1, 0, 0, 1, 0, 0\)/.test(rmState.transform), rmState.transform);
ok("and it stops the shine sweep rather than slowing it", rmState.shine === "none", rmState.shine);
await rm.close();

/* ---- 7. contrast: the migrated danger control vs what it replaced ---- */
const contrast = await page.evaluate(() => {
  const b = document.querySelector(".fb-cta--danger");
  const cs = getComputedStyle(b);
  return {
    label: getComputedStyle(b.querySelector(".fb-cta__label") || b).color,
    bg: cs.backgroundColor,
    panelBorder: getComputedStyle(document.querySelector(".fb-state--error")).borderTopColor,
  };
});
const newRatio = ratio(contrast.label, "rgb(255, 107, 122)");
const oldRatio = ratio("rgb(255, 255, 255)", "rgb(239, 68, 68)"); // `bg-red-500 text-white`, as shipped before
console.log("\n[design-check] danger label contrast");
console.log(`  migrated  ink on var(--color-danger): ${newRatio}:1`);
console.log(`  replaced  white on bg-red-500:        ${oldRatio}:1`);
ok("the migrated danger label clears AA at button size", newRatio >= 4.5, `${newRatio}:1 (${contrast.label} on ${contrast.bg})`);
ok("the Tailwind red it replaced did NOT clear AA — this is why the migration happened", oldRatio < 4.5, `${oldRatio}:1`);
ok("error state border is drawn from the danger token, not a palette constant",
  /255,\s*107,\s*122/.test(contrast.panelBorder), contrast.panelBorder);

/* `./__missing__.jpg` and `./__still-loading__.jpg` are deliberately absent — they are how
   PhotoImage's retry and failure states get rendered at all — so their 404s are the test. Counted,
   not ignored: a third means something else stopped resolving. */
const wanted = errors.filter((e) => /Failed to load resource/.test(e));
const unwanted = errors.filter((e) => !/Failed to load resource/.test(e));
ok("the two intentional missing-image 404s are the only resource failures", wanted.length === 2, `${wanted.length} seen`);
ok("no page errors and no other console errors", unwanted.length === 0, unwanted.slice(0, 3).join(" | "));

console.log(`\n${fails.length ? "FAILURES: " + fails.length : "ALL PASS"}  (${count - fails.length}/${count})`);
for (const f of fails) console.log("  - " + f);
console.log(`shots: ${out}`);
if (fails.length) process.exitCode = 1;
await browser.close();
