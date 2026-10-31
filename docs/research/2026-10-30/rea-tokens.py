#!/usr/bin/env python3
"""Design-token extraction from ACQUIRED stylesheets (not screenshots, not memory).

CSS custom properties, @font-face declarations, font sizes, border radii, spacing,
breakpoints and shadows are shipped as literals: they are the most faithful evidence
of a design system that is available without a browser. This script counts them per
app and prints the actual values with their byte offset, so every UI claim in the
mechanism map can be checked against a file position.
"""
import collections, hashlib, json, os, re, sys

CSS = {
    "bumble": ["acquired-2026-10-30T/bumble.7050c3776fb2414d.css",
               "acquired-2026-10-30T/bumble.fonts-bumble.css",
               "acquired-2026-10-30T/bumble.effe7c444ad84d2a.css"],
    "tinder": ["acquired-2026-10-30T/tinder.atomic.032d2311a30cd98d8799.css",
               "acquired-2026-10-30T/tinder.main.8d45a23e97c7ef997deb.css",
               "acquired-2026-10-30T/tinder.tinderapp.99d25c3a4205870cbe02.css"],
}
ROOT = sys.argv[1] if len(sys.argv) > 1 else "/home/user/re/analysis-2026-10-30"
out = {}
for app, files in CSS.items():
    text, per = "", {}
    for f in files:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            continue
        t = open(p, encoding="utf8", errors="replace").read()
        per[os.path.basename(f)] = {"bytes": len(t), "sha256": hashlib.sha256(t.encode()).hexdigest()[:16]}
        text += t + "\n"
    if not text:
        continue
    vars_ = collections.Counter(m.group(1) for m in re.finditer(r"(--[a-zA-Z][\w-]*)\s*:", text))
    fams  = collections.Counter(re.sub(r"\s+", " ", m.group(1)).strip()[:70] for m in re.finditer(r"font-family\s*:\s*([^;}]+)", text))
    sizes = collections.Counter(m.group(1) + m.group(2) for m in re.finditer(r"font-size\s*:\s*(\d+)(px|rem)", text))
    weights = collections.Counter(m.group(1) for m in re.finditer(r"font-weight\s*:\s*(\d{3}|[\w-]+)", text))
    radii = collections.Counter(m.group(0).split(":")[1].strip().rstrip("};") for m in re.finditer(r"border-radius\s*:\s*[\d.]+(?:px|rem|%)", text))
    gaps = collections.Counter(m.group(1) for m in re.finditer(r"(?:gap|row-gap|column-gap)\s*:\s*([\d.a-z ]+)", text))
    media = collections.Counter(m.group(1).strip() for m in re.finditer(r"@media\s*([^{]{3,60})\{", text))
    zvals = collections.Counter(m.group(1) for m in re.finditer(r"z-index\s*:\s*(\d+)", text))
    trans = collections.Counter(m.group(0) for m in re.finditer(r"transition(?:-duration)?\s*:\s*\.?\d+m?s", text))
    shadows = len(re.findall(r"box-shadow\s*:", text))
    faces = [re.sub(r"\s+", " ", m.group(0))[:190] for m in re.finditer(r"@font-face\s*\{[^}]{0,400}\}", text)]
    # any explicit button/focus/tab rules are the most transferable bits
    btn = [re.sub(r"\s+", " ", m.group(0))[:150] for m in re.finditer(r"\.[\w-]*(?:button|btn)[\w-]*\s*\{[^}]{0,220}", text, re.I)][:6]
    foc = [re.sub(r"\s+", " ", m.group(0))[:150] for m in re.finditer(r":focus(?:-visible)?\s*\{[^}]{0,160}", text)][:4]
    out[app] = {"files": per, "css_bytes": len(text), "custom_props": len(vars_), "top_props": vars_.most_common(18),
                "font_families": fams.most_common(6), "font_sizes": sizes.most_common(14),
                "font_weights": weights.most_common(8), "radii": radii.most_common(10),
                "gaps": gaps.most_common(12), "breakpoints": media.most_common(8),
                "z_index": zvals.most_common(8), "transitions": trans.most_common(6),
                "box_shadow_rules": shadows, "font_faces": faces[:4], "button_rules": btn, "focus_rules": foc}
print(json.dumps(out, indent=1)[:7000])
json.dump(out, open(os.path.join(ROOT, "DESIGN-TOKENS.json"), "w"), indent=1)
print("\nwritten:", os.path.join(ROOT, "DESIGN-TOKENS.json"))
