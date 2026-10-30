#!/usr/bin/env python3
"""
Split a webpack/Next.js production bundle into its modules, so that a file too large
for one REA invocation can still be analysed — bounded, per module, with provenance.

Why this exists: analysis-2026-10-29/bumble/4101edefd833a9ef.js is 376,898 bytes on a
single line. Whole-directory REA runs truncated it and three targeted retries (180 s,
600 s, 900 s, 768 MB heap) all exited 1. Leaving it unanalysed was recorded as the one
gap in the campaign (41 of 42 files). Byte-slicing a minified file at arbitrary offsets
would produce garbage, so instead this walks the bundle's OWN structure: webpack 5 emits
`(self.webpackChunk_X=self.webpackChunk_X||[]).push([[ids],{ <id>:(m,e,t)=>{...}, ... }])`,
i.e. the module map is delimited by numeric keys at a known nesting depth. Splitting on
those boundaries yields complete, individually meaningful compilation units — the exact
"client modules" the brief asks for, not arbitrary text.

Every derived file records the byte range it came from and the sha256 of the parent
bundle, so a finding can always be walked back to real acquired bytes.
"""
import hashlib
import json
import os
import re
import sys
import time

# webpack 5 emits `id:(m,e,t)=>{`, older/alternative output uses `id:function(...)`
# or `id:async function(...)`. All three forms are a module head; anything else at this
# depth is inside a module body.
KEY_RE = re.compile(r"[,{]\s*(\d{1,6})\s*:\s*(?:\(|function\b|async\s+function\b|class\b)")


def find_modules(src: str):
    """Return [(module_id, start_of_body, header_start)] for a webpack module map."""
    # Locate the module map: the second element of the .push([[...], { ... }]) call.
    push = src.find(".push([[")
    if push < 0:
        raise SystemExit("not a webpack .push([[...]]) bundle — refusing to guess boundaries")
    # walk to the first '{' after the chunk-id array closes
    i = src.index("]", push + len(".push(["))
    while i < len(src) and src[i] != "{":
        i += 1
    depth, j, body = 0, i, None
    for k in range(i, len(src)):
        c = src[k]
        if c == "{":
            depth += 1
            if depth == 1:
                body = k + 1
                break
    if body is None:
        raise SystemExit("could not locate the module map object")

    # NB: search from body-1. The map opens with `{6787:function(` and the head pattern
    # must include that `{`; starting AT body skipped the first module entirely, which
    # silently dropped react-dom's 174,683-byte module (47% of the bundle) on the first
    # run. A partition that quietly loses the largest member is worse than no partition,
    # because every count and total below would have looked plausible. The coverage line
    # printed at the end is the guard: it must be ~100%.
    heads = [(m.group(1), m.start() + (1 if src[m.start()] == "{" else 2), m.start())
             for m in KEY_RE.finditer(src, body - 1)]
    if len(heads) < 3:
        raise SystemExit(f"only {len(heads)} module keys found — refusing to emit a partial view")
    out = []
    for n, (mid, _body_start, head_start) in enumerate(heads):
        end = heads[n + 1][2] if n + 1 < len(heads) else len(src)
        # a module's text runs from its key to the next key (or the closing of the map)
        out.append((mid, head_start, end))
    return out


def strings_of(text: str, limit=400):
    """Quoted literals, deduped, capped — the cheap signal that survives minification."""
    lits = re.findall(r'"((?:[^"\\\n]|\\.){3,80})"', text)
    seen, out = set(), []
    for s in lits:
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= limit:
            break
    return out


INTEREST = {
    "media": r"image/|video/|audio/|\.mp4|\.jpg|\.jpeg|\.webp|blob|upload|thumbnail|resize|compress|exif|orientation|poster",
    "network": r"fetch\(|XMLHttpRequest|axios|/v\d/|graphql|wss://|WebSocket|EventSource|retry|backoff|429",
    "storage": r"localStorage|sessionStorage|indexedDB|caches\.|openDatabase|Cookie",
    "mediaz": r"cdn|cloudfront|akamai|fastly|signed|signature|Expires=|X-Amz|s3\.",
    "identity": r"liveness|selfie|face|passport|kyc|idensic|veriffy|yoti|jumio|device_id|install_id|jio",
    "matching": r"preferen|filter|age|distance|discover|rank|score|profile_view|swipe|deck",
    "realtime": r"onmessage|send\(|heartbeat|ping|pong|reconnect|seq|typing|read_receipt|seen",
    "crypto": r"crypto|hash|sha256|btoa|atob|encrypt|token|bearer",
    "ui": r"className|styled|css|rem|px|font-size|border-radius|grid|flex|media\s*\(",
}


def classify(text: str):
    hits = {}
    for name, pat in INTEREST.items():
        n = len(re.findall(pat, text, flags=re.I))
        if n:
            hits[name] = n
    return hits


def main():
    bundle, outdir, site = sys.argv[1], sys.argv[2], sys.argv[3]
    src = open(bundle, encoding="utf8", errors="replace").read()
    parent_sha = hashlib.sha256(open(bundle, "rb").read()).hexdigest()
    mods = find_modules(src)
    os.makedirs(outdir, exist_ok=True)

    entries, table = [], []
    for mid, start, end in mods:
        text = src[start:end]
        name = f"module-{mid}.js"
        path = os.path.join(outdir, name)
        with open(path, "w", encoding="utf8") as fh:
            fh.write(f"/* DERIVED FILE — NOT AN ACQUIRED ARTIFACT.\n"
                     f" * Extracted from {os.path.basename(bundle)} bytes [{start},{end}) by\n"
                     f" * rea-extract-modules.py on {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}.\n"
                     f" * Parent sha256 {parent_sha}.\n"
                     f" * Boundaries are webpack module-map keys, so this is a complete\n"
                     f" * compilation unit rather than an arbitrary slice; trailing commas or\n"
                     f" * the map's closing brace may be included. Do not treat this file's\n"
                     f" * layout as evidence about the shipped asset. */\n" + text)
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        entries.append({
            "file": name, "bytes": os.path.getsize(path), "sha256": h,
            "derived_from": os.path.abspath(bundle), "parent_sha256": parent_sha,
            "byte_range": [start, end], "module_id": mid,
            "source_url": f"derived://webpack-module/{mid}", "content_type": "text/javascript",
        })
        table.append((mid, len(text), classify(text)))

    with open(os.path.join(outdir, "_manifest.json"), "w") as fh:
        json.dump({
            "note": "DERIVED ARTIFACT. Not acquired from the network. Each file is one webpack "
                    "module of an acquired bundle, cut at the bundle's own module boundaries. "
                    "Analysis of these files is analysis of real shipped code, but file names, "
                    "counts and sizes describe this partition, not the competitor's source tree.",
            "parent": {"file": os.path.basename(bundle), "bytes": os.path.getsize(bundle), "sha256": parent_sha},
            "generator": os.path.abspath(__file__),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "files": entries,
        }, fh, indent=1)

    total = sum(t[1] for t in table)
    print(f"{site}: {len(table)} modules, {total:,} bytes of body (bundle {len(src):,} bytes, "
          f"{total * 100 // max(len(src), 1)}% of it accounted for as module bodies)")
    agg = {}
    for _mid, _n, hits in table:
        for k, v in hits.items():
            agg[k] = agg.get(k, 0) + v
    print("keyword totals:", json.dumps(agg, sort_keys=True))
    print("\nlargest modules:")
    for mid, n, hits in sorted(table, key=lambda x: -x[1])[:12]:
        print(f"  {mid:>7} {n:>8,}B  {json.dumps(hits, sort_keys=True)}")
    with open(os.path.join(outdir, "_extraction-summary.json"), "w") as fh:
        json.dump({"site": site, "parent": entries[0]["parent_sha256"], "modules": len(table),
                   "bytes_accounted": total, "totals": agg,
                   "per_module": [{"id": m, "bytes": n, "hits": h} for m, n, h in table]}, fh, indent=1)


if __name__ == "__main__":
    main()
