/**
 * Browser QA for the end-of-conversation dialog (2026-10-30).
 *
 * Why this exists: `tsc`, `eslint` and `next build` all passed on the two client defects this
 * dialog fixes, because neither defect was a type error — one handler fired without asking, the
 * other sent a body the route had told it never to send. Only a browser can show whether focus
 * lands on the safe button, whether Escape is bound, and whether the chosen reason actually
 * reaches the handler.
 *
 * It drives the REAL component (scripts/qa/build.mjs bundles scripts/qa/ui-kit.tsx, which
 * imports src/components/app/unmatch-dialog.tsx) against the CSS Next emitted for the app. It
 * is not a re-implementation: every assertion below runs against code the product imports.
 *
 *   node scripts/qa/build.mjs && node scripts/qa/dialog-check.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = "file://" + resolve("public/qa/index.html");
const shots = resolve("scripts/qa/.shots");
const report = resolve("docs/research/2026-10-30");
await mkdir(shots, { recursive: true });
await mkdir(report, { recursive: true });

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass: pass === true, ...(detail === undefined ? {} : { detail }) });
  return pass === true;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
/* The QA page also mounts PhotoImage against a deliberately missing sibling file, which logs
   `net::ERR_FILE_NOT_FOUND` by design (that is how the retry/failure path gets exercised).
   Filtering those out is honest only because the fixture is named here; anything else in
   `errors` is real. */
const EXPECTED_RESOURCE_FAILURES = /ERR_FILE_NOT_FOUND/;
const expected = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  (EXPECTED_RESOURCE_FAILURES.test(m.text()) ? expected : errors).push("console: " + m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const dialog = page.locator('[role="dialog"][aria-modal="true"]');
const D = '[role="dialog"][aria-modal="true"]';
const open = async (kind, busy = false) => {
  await page.evaluate(([k, b]) => window.__qaEnd.open(k, b), [kind, busy]);
  await page.waitForTimeout(320);
};
const result = () => page.evaluate(() => window.__qaEnd.result());
const chips = () => page.locator(`${D} button[aria-pressed]`);

// ---------------------------------------------------------------- 1. it opens and is labelled
await open("unmatch");
ok("dialog mounts from the product component", (await dialog.count()) === 1, await dialog.count());
ok("title resolves through aria-labelledby",
  await page.evaluate(() => {
    const t = document.querySelector("#fb-end-conv-title");
    const d = document.querySelector('[role="dialog"]');
    return !!t && !!d && d.getAttribute("aria-labelledby") === "fb-end-conv-title" && t.textContent.trim().length > 4;
  }));
const bullets = await page.locator(`${D} ul li`).count();
ok("consequences are stated, not implied (3+ bullets)", bullets >= 3, bullets);

// ---------------------------------------------------------------- 2. focus and the keyboard
const focused = (await page.evaluate(() => document.activeElement?.textContent?.trim())) ?? "";
ok("focus starts on the NON-destructive choice", focused === "Keep it", focused);
await page.keyboard.press("Tab");
const afterTab = (await page.evaluate(() => document.activeElement?.textContent?.trim())) ?? "";
ok("Tab moves into the dialog's own controls (no focus escape to the page behind)",
  await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), afterTab);
await page.keyboard.press("Escape"); // reset to a known state, then re-open for the trap checks
await page.waitForTimeout(200);
await open("unmatch");
const inSheet = () => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
for (let i = 0; i < 8; i++) await page.keyboard.press("Tab"); // 6 chips + report + 2 actions = well past the end
ok("Tab cannot walk out of the sheet — it wraps, so the page behind stays unreachable",
  (await inSheet()) === true, await page.evaluate(() => document.activeElement?.textContent?.trim()));
await page.keyboard.press("Shift+Tab");
ok("and Shift+Tab wraps backwards instead of escaping", (await inSheet()) === true,
  await page.evaluate(() => document.activeElement?.textContent?.trim()));
const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim());
ok("the wrapped focus lands on a real control, not a hidden one",
  typeof focusedLabel === "string" && focusedLabel.length > 0, focusedLabel);

/* `!/^0px none/` once passed on a computed `3px none` — a style of `none` IS no indicator,
   whatever the width says. Read outlineStyle, and check both control kinds, because the chips
   are the ones a keyboard member rests on while choosing a reason. Measured after real Tab
   presses so :focus-visible is actually engaged. */
/* "Visible focus indicator" means EITHER mechanism, and this app uses both: the shared Button
   draws `outline: 2px solid`, while the app-wide
   `:where(a,button,select,[role=button]):focus-visible` rule draws a `box-shadow` ring with
   `outline: none`. Demanding `outline-style: solid` failed the chips for the wrong reason, and
   the earlier `!/^0px none/` check PASSED a literal `3px none` — a ring of nothing. Read both
   properties, require a spread of >=1.5px, and settle the transition first (the chip animates,
   so an immediate read reports a mid-flight 1.82px instead of the final 2px). */
const ringOf = async () => {
  await page.waitForTimeout(320);
  return page.evaluate(() => {
    const el = document.activeElement;
    const s = getComputedStyle(el);
    const m = s.boxShadow ? s.boxShadow.match(/(\d+(?:\.\d+)?)px\s*\)?\s*$/g) : null;
    const spreads = s.boxShadow && s.boxShadow !== "none"
      ? s.boxShadow.split(/,(?![^(]*\))/).map((p) => {
          // parseFloat, NOT Number: Number("2px") is NaN, which JSON-serialised as null and
          // made a real 2px ring look like a missing one.
          const nums = p.match(/(-?\d+(?:\.\d+)?)px/g)?.map((v) => parseFloat(v)) ?? [];
          return nums.length ? Math.max(...nums) : 0;
        })
      : [0];
    return {
      label: el.textContent?.trim().slice(0, 22),
      style: s.outlineStyle,
      width: parseFloat(s.outlineWidth) || 0,
      shadowSpread: Math.max(...spreads, 0),
      shadow: s.boxShadow === "none" ? null : s.boxShadow.slice(0, 48),
    };
  });
};
const hasRing = (r) => (r.style === "solid" && r.width >= 2) || r.shadowSpread >= 1.5;
await open("unmatch");
const actionRing = await ringOf();
ok("the focused action shows a real ring (solid >=2px outline, or a box-shadow spread)",
  hasRing(actionRing), actionRing);
await page.keyboard.press("Shift+Tab"); // wraps to the last reason chip
const chipRing = await ringOf();
ok("and so does a reason chip — the control a keyboard member rests on while choosing",
  hasRing(chipRing) && chipRing.label !== actionRing.label, chipRing);

await page.keyboard.press("Escape");
await page.waitForTimeout(280);
const afterEsc = await result();
ok("Escape closes the sheet and routes to onCancel",
  (await dialog.count()) === 0 && afterEsc.cancels === 1, afterEsc);

// ---------------------------------------------------------------- 3. the payload that used to be lost
await open("unmatch");
const chipCount = await chips().count();
ok("every unmatch reason is offered", chipCount === 6, chipCount);
await chips().nth(0).click();
await page.waitForTimeout(140);
ok("a chosen reason is visibly pressed", (await chips().nth(0).getAttribute("aria-pressed")) === "true");
await chips().nth(0).click();
await page.waitForTimeout(120);
ok("and choosing it again clears it (reasons stay optional)",
  (await chips().nth(0).getAttribute("aria-pressed")) === "false");
await chips().nth(0).click();
await page.locator(`${D} .fb-cta--danger`).click();
await page.waitForTimeout(220);
const sent = await result();
ok("the reason reaches onConfirm — the value the route persists",
  JSON.stringify(sent.confirms) === JSON.stringify(["not_interested"]), sent.confirms);
ok("the sheet stays open while the parent works (no optimistic close)",
  (await dialog.count()) === 1);

// ---------------------------------------------------------------- 4. report-instead branch
await open("unmatch");
await chips().nth(3).click(); // inappropriate
await page.waitForTimeout(200);
const reportBlock = page.locator(`${D} p`, { hasText: /moderators/ });
ok("a safety-shaped reason turns the sheet toward reporting", (await reportBlock.count()) === 1);
const reportBtn = page.locator(`${D} button`, { hasText: /instead/i });
ok("and offers the report action itself", (await reportBtn.count()) === 1);
await reportBtn.click();
await page.waitForTimeout(160);
ok("clicking it calls onReport", (await result()).reports === 1);
await page.locator(`${D} .fb-cta--danger`).click();
await page.waitForTimeout(180);
ok("ending for that reason still carries it through (report is offered, never substituted)",
  JSON.stringify((await result()).confirms) === JSON.stringify(["inappropriate"]));

// ---------------------------------------------------------------- 5. busy must be inert
await open("unmatch", true);
const busyState = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const danger = d.querySelector(".fb-cta--danger");
  const keep = d.querySelector(".fb-cta--secondary");
  return {
    busy: danger.getAttribute("aria-busy"),
    disabled: danger.disabled === true || danger.getAttribute("aria-disabled") === "true",
    keepDisabled: keep.disabled === true,
    chipsLocked: [...d.querySelectorAll("button[aria-pressed]")].every((b) => b.disabled),
  };
});
ok("while the request is in flight the confirm button is aria-busy and disabled",
  busyState.busy === "true" && busyState.disabled === true, busyState);
ok("and nothing in the sheet is clickable — no double-fire, no editing mid-request",
  busyState.keepDisabled === true && busyState.chipsLocked === true, busyState);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
ok("Escape does NOT close mid-request (a closed sheet would hide a result nobody read)",
  (await dialog.count()) === 1);
await page.mouse.click(8, 8); // the backdrop
await page.waitForTimeout(200);
ok("backdrop click is inert while busy too", (await dialog.count()) === 1);

// ---------------------------------------------------------------- 6. geometry and contrast
await open("unmatch");
const geo = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"] > div');
  const r = d.getBoundingClientRect();
  return {
    x: r.x, y: r.y, w: r.width, h: r.height,
    vw: innerWidth, vh: innerHeight,
    scrollable: d.scrollHeight > d.clientHeight + 1,
    clipped: getComputedStyle(d).overflowY,
  };
});
ok("the sheet fits the 390px viewport without horizontal overflow",
  geo.x >= -0.5 && geo.x + geo.w <= geo.vw + 1, geo);
ok("and reaches the bottom edge as a sheet, scrolling internally if content grows",
  geo.y >= 0 && geo.y + geo.h <= geo.vh + 1 && (!geo.scrollable || geo.clipped !== "visible"), geo);
const contrast = await page.evaluate(() => {
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
      const x = +v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
  };
  const d = document.querySelector('[role="dialog"] > div');
  const bg = getComputedStyle(d).backgroundColor;
  const danger = d.querySelector(".fb-cta--danger");
  const li = d.querySelector("ul li");
  return {
    bodyOnSheet: ratio(getComputedStyle(li).color, bg),
    dangerLabel: ratio(getComputedStyle(danger.querySelector(".fb-cta__label") ?? danger).color,
      getComputedStyle(danger).backgroundColor),
  };
});
ok("consequence copy meets 4.5:1 on the sheet", contrast.bodyOnSheet >= 4.5, contrast);
ok("the destructive label meets 4.5:1 on its own fill", contrast.dangerLabel >= 4.5, contrast);

// ---------------------------------------------------------------- 7. the destructive variant reads differently
const unmatchTitle = await page.evaluate(() => document.querySelector("#fb-end-conv-title").textContent.trim());
await open("delete");
const deleteTitle = await page.evaluate(() => document.querySelector("#fb-end-conv-title").textContent.trim());
ok("delete-conversation is a different sheet, not the same words",
  unmatchTitle !== deleteTitle, { unmatchTitle, deleteTitle });
ok("and it asks for no reason (a wipe has nothing to explain to the match)",
  (await chips().count()) === 0, await chips().count());
await page.locator(`${D} .fb-cta--danger`).click();
await page.waitForTimeout(180);
ok("its confirm carries NO reason rather than a fabricated one",
  JSON.stringify((await result()).confirms) === JSON.stringify([null]), (await result()).confirms);

// ---------------------------------------------------------------- 8. desktop + screenshots
await page.setViewportSize({ width: 1280, height: 900 });
await open("unmatch");
const desktop = await page.evaluate(() => {
  const r = document.querySelector('[role="dialog"] > div').getBoundingClientRect();
  return { w: r.width, centred: Math.abs(r.x + r.width / 2 - innerWidth / 2) < 2, top: r.y > 0 };
});
ok("on desktop it is a centred modal, not a sheet stuck to the bottom",
  desktop.centred && desktop.top && desktop.w <= 421, desktop);

// ---------------------------------------------------------------- 9. the photographs
// Taken at the member's own viewport, before the desktop resize below, so the PNGs document the
// phone case that the layout is written for (a desktop-only screenshot would flatter it).
await page.setViewportSize({ width: 390, height: 844 });
await open("unmatch");
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/dialog-unmatch.png` });
await open("unmatch");
await chips().nth(3).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/dialog-report-branch.png` });
await open("unmatch", true);
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/dialog-busy.png` });
await open("delete");
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/dialog-delete.png` });
await page.setViewportSize({ width: 1280, height: 900 });
await open("unmatch");
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/dialog-desktop.png` });
for (const f of ["dialog-unmatch", "dialog-report-branch", "dialog-busy", "dialog-delete", "dialog-desktop"])
  await copyFile(`${shots}/${f}.png`, `${report}/${f}.png`);

ok("no page errors while all of that ran", errors.length === 0, errors.slice(0, 4));
ok("and the only console noise is the deliberate missing-asset fixture",
  expected.length === 2 && expected.every((e) => EXPECTED_RESOURCE_FAILURES.test(e)),
  { expected: expected.length });

await browser.close();

const failed = results.filter((r) => !r.pass);
await writeFile(
  `${report}/DIALOG-QA-2026-10-30.json`,
  JSON.stringify(
    {
      date: "2026-10-30",
      harness: "scripts/qa/dialog-check.mjs (Playwright + headless Chromium, real component, real emitted CSS)",
      environment: {
        viewportPrimary: "390x844 @2x (member phone)",
        viewportSecondary: "1280x900",
        page: "file://public/qa/index.html generated by scripts/qa/build.mjs",
        apiCalls: "none — callbacks are recorded, no network, no signed-in member session",
      },
      limits: [
        "Mounted in the QA harness, not inside /app/chat after sign-in: the parent wiring (profile-view -> route) is asserted by scripts/trust/harness.ts [20], not here.",
        "Chromium only. No iOS/Android WebView, no screen reader pass — VoiceOver/TalkBack behaviour is unverified.",
        "Fonts fall back to system faces here, so type metrics carry the same caveat as VISUAL-QA-2026-10-30.json.",
      ],
      expectedConsoleNoise: expected,
      results,
      summary: { passed: results.length - failed.length, failed: failed.length, total: results.length },
    },
    null,
    2
  ) + "\n"
);
console.log("");
for (const r of results) console.log(`  ${r.pass ? "ok  " : "FAIL"} ${r.name}${r.detail === undefined ? "" : "  " + JSON.stringify(r.detail)}`);
console.log(`\n${failed.length ? "FAILURES: " + failed.length : "ALL PASS"} (${results.length - failed.length}/${results.length}) → docs/research/2026-10-30/DIALOG-QA-2026-10-30.json`);
process.exit(failed.length ? 1 : 0);
