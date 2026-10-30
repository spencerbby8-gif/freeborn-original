/**
 * Renders scripts/qa/ui-kit.tsx in headless Chromium and photographs the design layer at
 * three viewports, plus the interaction states a screenshot of markup cannot show:
 * hover, focus-visible, disabled and the media failure path. Exits non-zero if the browser
 * cannot start, so a missing toolchain is a loud failure rather than a silent "verified".
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve("scripts/qa/.shots");
await mkdir(out, { recursive: true });
const url = "file://" + resolve("public/qa/index.html");
/* Pointer capability is what the hover gate keys on, so measure BOTH sides of it:
   the default headless shell does not advertise a fine pointer (that is a real finding —
   the overlay must stay off), and forcing primaryPointerType=2 (Blink kFine) must turn it on.
   Without the second run, "hover did nothing" would be indistinguishable from a broken rule. */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 1180 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const shots = [];
async function shot(name, fn) { if (fn) await fn(); await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); shots.push(name); }
await shot("mobile-default");
await page.setViewportSize({ width: 1280, height: 1000 });
await shot("desktop-default");

const measured = await page.evaluate(() => {
  const px = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
  const b = document.querySelector(".fb-cta--primary");
  const s = document.querySelector(".fb-cta--sm");
  const l = document.querySelector(".fb-cta--lg");
  const danger = document.querySelector(".fb-cta--danger");
  const load = document.querySelector(".fb-cta--loading");
  const card = document.querySelector("figure > div");
  return {
    primaryHeight: b.getBoundingClientRect().height,
    smHeight: s.getBoundingClientRect().height,
    lgHeight: l.getBoundingClientRect().height,
    radius: px(b, "border-radius"),
    fontSize: px(b, "font-size"),
    fontWeight: px(b, "font-weight"),
    primaryBg: px(b, "background-color"),
    primaryColor: px(b, "color"),
    dangerBg: px(danger, "background-color"),
    spinner: getComputedStyle(load, "::before").animationName,
    cardRadius: px(card, "border-radius"),
    h1: px(document.querySelector("h1"), "font-size"),
    body: px(document.querySelector("p + p"), "font-size"),
  };
});

await page.setViewportSize({ width: 390, height: 1180 });
await page.waitForTimeout(200);
const hover = await (async () => {
  const b = page.locator(".fb-cta--primary").first();
  await b.hover();
  return page.evaluate(() => getComputedStyle(document.querySelector(".fb-cta--primary"), "::after").backgroundColor);
})();
await shot("mobile-hover");
await page.keyboard.press("Tab");
const focusRing = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { tag: el.tagName, cls: String(el.className).slice(0, 28), outline: cs.outlineWidth + " " + cs.outlineStyle + " " + cs.outlineColor };
});
await shot("mobile-focus");
const failed = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => /didn.t load/i.test(b.textContent || ""));
  return { count: btns.length, text: btns[0]?.textContent?.trim().slice(0, 60) ?? null, label: btns[0]?.getAttribute("aria-label")?.slice(0, 50) ?? null };
});
await page.locator("figure:nth-child(3) button").last().click().catch(() => {});
await shot("mobile-after-retry-click");
const contrast = await page.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const b = document.querySelector(".fb-cta--primary");
  const bg = getComputedStyle(b).backgroundColor, fg = getComputedStyle(b).color;
  const L1 = lum(bg), L2 = lum(fg);
  return { bg, fg, ratio: +(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05))).toFixed(2) };
});

/* Now relaunch with a fine pointer and re-measure the same hover. */
const fine = await chromium.launch({ args: ["--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=2,availableHoverTypes=2"] });
const fp = await fine.newPage({ viewport: { width: 390, height: 1180 }, deviceScaleFactor: 2 });
await fp.goto(url, { waitUntil: "networkidle" });
await fp.waitForTimeout(500);
await fp.locator(".fb-cta--primary").first().hover();
await fp.waitForTimeout(300);
const hoverFine = await fp.evaluate(() =>
  getComputedStyle(document.querySelector(".fb-cta--primary"), "::after").backgroundColor);
const matchesFine = await fp.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
await fp.screenshot({ path: `${out}/mobile-hover-fine.png` });

/* The pressed state is NOT behind the capability gate, so it isolates the two explanations:
   if ::after paints on mouse-down but not on hover, the overlay layer works and only the
   hover gate is closed (this headless context has no fine pointer). */
const hold = await (async () => {
  const b = fp.locator(".fb-cta--primary").first();
  const box = await b.boundingBox();
  await fp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await fp.mouse.down();
  const v = await fp.evaluate(() => {
    const el = document.querySelector(".fb-cta--primary");
    const after = getComputedStyle(el, "::after").backgroundColor;
    const hoverMatches = matchMedia("(hover: hover)").matches;
    const pointerFine = matchMedia("(pointer: fine)").matches;
    /* Structural proof that the hover rule exists and is media-gated, read from the real
       stylesheet the browser parsed — not from the source file. */
    let found = null;
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const r of list) {
          if (r.type === 4 || r.type === 12) { const inner = walk(r.cssRules); if (inner) return { media: r.conditionText, rule: inner }; }
          if (r.selectorText && r.selectorText.includes(".fb-cta:not(:disabled):hover::after")) return r.cssText;
        }
        return null;
      };
      const hit = walk(rules);
      if (hit) { found = hit; break; }
    }
    return { after, hoverMatches, pointerFine, found: found ? JSON.stringify(found).slice(0, 220) : null };
  });
  await fp.screenshot({ path: `${out}/mobile-pressed.png` });
  await fp.mouse.up();
  return v;
})();
await fine.close();

console.log(JSON.stringify({
  shots: [...shots, "mobile-hover-fine"],
  measured, hoverOverlayAfter: hover, hoverOverlayWithFinePointer: hoverFine,
  capabilityGate: {
    finePointerMediaMatches: matchesFine,
    gateCorrectlyClosed: hover === "rgba(0, 0, 0, 0)",
    gateCorrectlyOpen: /0\.14|^rgba\(255, 255, 255/.test(hoverFine),
  },
  pressedState: hold, focusRing, failed, contrast, pageErrors: errors,
}, null, 1));
await browser.close();
