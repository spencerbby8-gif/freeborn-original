#!/usr/bin/env python3
"""
Second-pass mine: high-precision patterns only.

The first pass (rea-mine.py) was honest about its method but not about its noise, and the
samples exposed the problem — a "verification_liveness: 423" score for Bumble turned out to
be Danish marketing copy containing the word "selfie", "upload_transport: 70" in the React
chunk was `slice(0,5)`, and Hinge's "image_transform: 117" was mostly framer-motion's
`rotate`/`scale` props and video.js resize listeners. Any of those quoted as a mechanism
would have been a fabricated finding wearing a count's clothes.

So the rules here: every pattern must be unambiguous in isolation, each carries a `why`
that states exactly what the string proves and what it does NOT prove, and each prints its
own sample so a human can see the hit that produced the number. Zero is reported as zero —
"absent from the acquired surface", never "the product does not have this", because for
Tinder only the HTML shell was ever acquired and for Bumble/Hinge only the chunks their
entry page references.
"""
import hashlib
import json
import os
import re
import sys
import time

PATTERNS = [
    {
        "id": "next_image_config",
        "cap": "photo delivery",
        "re": r"(?:deviceSizes|imageSizes)\s*:\s*\[[^\]]{0,160}\]|qualities\s*:\s*\[[^\]]{0,120}\]|path\s*:\s*\"/_next/image\"",
        "why": "The next/image width ladder the client actually requests. Proves which "
               "renditions exist and that sizing is delegated to the /_next/image optimizer. "
               "Says nothing about where the originals live or how they are authorized.",
    },
    {
        "id": "blur_placeholder",
        "cap": "render failure handling",
        "re": r"blurDataURL|\"lqip\"|lqip\s*:|placeholder\s*:\s*\"blur\"",
        "why": "A placeholder path for a not-yet-loaded or broken image, and where the blur "
               "hash comes from. Proves the client renders SOMETHING while/after failure; "
               "does not prove the asset was recovered, only visually masked.",
    },
    {
        "id": "local_preview",
        "cap": "upload UX",
        "re": r"URL\.createObjectURL\([^)]{0,24}\)\s*[,)]|createObjectURL\(await \w+\.blob\(\)\)",
        "why": "Object-URL previews built from the local File before/independent of any "
               "server response, i.e. the picker shows the member their own bytes first. "
               "Nothing about storage or ACLs.",
    },
    {
        "id": "progress_put",
        "cap": "upload transport",
        "re": r"\.upload\.onprogress|XMLHttpRequest\(\)|new FormData\(\)|FormData\(\);[^;]{0,80}append\(",
        "why": "Whether uploads go through XHR-with-progress / FormData (one-shot multipart) "
               "as opposed to fetch(stream). Deliberately narrow: `FormData` alone is not an "
               "upload claim unless it is followed by an append, which is why the alternation "
               "is written that way.",
    },
    {
        "id": "resumable_chunks",
        "cap": "upload durability",
        "re": r"resumable(?!State)|uppy|tus-js|multipartUpload|createMultipartUpload|partSize|chunkSize\s*:",
        "why": "Chunked / resumable upload machinery. A zero here is a real signal: it means "
               "the acquired client does NOT contain chunking libs, so a mid-flight failure "
               "restarts the whole file.",
    },
    {
        "id": "media_capture",
        "cap": "voice notes, video, liveness",
        "re": r"navigator\.mediaDevices|getUserMedia\(|getDisplayMedia\(|MediaRecorder|RTCAudioWorklet",
        "why": "Direct-to-hardware capture (mic/camera) exists in this bundle. The single most "
               "specific marker available; `voice` or `camera` as bare words are not used.",
    },
    {
        "id": "webrtc_calls",
        "cap": "calls",
        "re": r"RTCPeerConnection|webkitRTCPeerConnection|iceServers|\"turns?:|\bsdp\b|createDataChannel|onicecandidate",
        "why": "Peer connection machinery for in-app calls/video, including TURN relay "
               "configuration. Zero means the call stack is not in the acquired surface "
               "(iOS apps and lazy chunks are outside this capture).",
    },
    {
        "id": "ws_transport",
        "cap": "realtime",
        "re": r"new WebSocket\(|wss?://[a-z0-9.-]+|socket\.io|ably[- ]?realtime|pusher-js|centrifuge",
        "why": "The realtime transport named literally, with its endpoint host when present. "
               "This is the strongest evidence available about messaging plumbing; the server "
               "protocol behind the socket remains unknown by definition.",
    },
    {
        "id": "verification_vendor",
        "cap": "identity verification",
        "re": r"\bjumio\b|\bonfido\b|\bveriff\b|\byoti\b|\bidensic\b|\bmldl\b|\bgetverified\b|age[ _-]?estimation|liveness[ _-]?check",
        "why": "Third-party identity/liveness vendor SDKs or endpoint names. Word-bounded on "
               "purpose: an earlier unbounded `persona` pattern matched 'personalizedOffer' "
               "80 times in Tinder's copy and would have 'found' Persona.",
    },
    {
        "id": "device_identifier",
        "cap": "fraud prevention",
        "re": r"device_id|\"deviceId\"|install_id|\"installId\"|app_id\s*=|deviceFingerprint|getUniqueId",
        "why": "A stable identifier the client sends with requests — the hook that duplicate-"
               "account and ban-evasion detection hangs on. Does not show what the server "
               "does with it.",
    },
    {
        "id": "storage_scope",
        "cap": "media storage",
        "re": r"localStorage\.(?:setItem|getItem)\(|sessionStorage\.(?:setItem|getItem)\(|indexedDB\.open\(|caches\.open\(",
        "why": "Client-side persistence, with the key literal so the purpose is readable. "
               "Relevant to media recovery: a draft cached client-side survives a failed POST.",
    },
    {
        "id": "retry_backoff",
        "cap": "failure handling",
        "re": r"retry\(\s*\{[^}]{0,60}\}|exponential|backoff|ratelimit_backoff|retryAfter|Retry-After|maxRetries|retriesLeft",
        "why": "Explicit retry/backoff policy in client code, often with its bounds. The most "
               "transferable single mechanism for 'media that failed to send'.",
    },
    {
        "id": "svg_policy",
        "cap": "media safety",
        "re": r"dangerouslyAllowSVG\s*:\s*!?\d|dangerouslyAllowSVG\s*:\s*(?:true|false)|contentDispositionType|contentSecurityPolicy\s*:\s*\"[^\"]{0,80}",
        "why": "How the image optimizer is prevented from rendering attacker-controlled SVG "
               "markup, and what CSP/disposition the served images carry. Directly relevant to "
               "a public upload bucket.",
    },
    {
        "id": "tab_labels",
        "cap": "UI structure",
        "re": r"\"(?:tabs|nav|bottomNav|primaryNav)\"\s*:\s*\{|\"label\"\s*:\s*\"(?:Discover|Matches|Profile|Search|Likes|Dates|Connections)\"",
        "why": "Navigation/label structures in shipped JSON, i.e. the tab arrangement as the "
               "client renders it. UI-tokens from third-party widget CSS are NOT counted: that "
               "is what the first pass mistook for a design system.",
    },
]

APPS = {
    "bumble": ("/home/user/re/analysis-2026-10-29/bumble", lambda n: not n.startswith("._")),
    "hinge": ("/home/user/re/analysis-2026-10-29/hinge", lambda n: not n.startswith("._")),
    "tinder": ("/home/user/re/bundles", lambda n: n.startswith("tinder")),
}


def main(out_path):
    result, lines = {}, []
    for app, (root, keep) in APPS.items():
        hits = {}
        files = {}
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if not os.path.isfile(p) or not keep(name):
                continue
            if not (name.endswith(".js") or name.endswith(".html")):
                continue
            raw = open(p, encoding="utf8", errors="replace").read()
            body = raw
            if name.endswith(".html"):
                body = "\n".join(re.findall(r"<script[^>]*>(.*?)</script>", raw, flags=re.S | re.I)) or raw
            files[name] = len(raw)
            for pat in PATTERNS:
                for m in re.finditer(pat["re"], body, flags=re.I):
                    frag = re.sub(r"\s+", " ", body[max(0, m.start() - 40):m.end() + 60])[:150]
                    hits.setdefault(pat["id"], []).append(
                        {"file": name, "at": m.start(), "text": frag,
                         "sha16": hashlib.sha256(raw.encode("utf8", "replace")).hexdigest()[:16]})
        result[app] = {"files": files, "hits": hits}

    order = {p["id"]: p for p in PATTERNS}
    print(f"{'pattern':20}{'cap':26}{'bumble':>9}{'hinge':>9}{'tinder':>9}")
    for pid, meta in ((p["id"], p) for p in PATTERNS):
        row = []
        for app in APPS:
            n = len(result[app]["hits"].get(pid, []))
            row.append(n)
        print(f"{pid:20}{meta['cap'][:25]:26}{row[0]:>9}{row[1]:>9}{row[2]:>9}")
        for app in APPS:
            for h in result[app]["hits"].get(pid, [])[:2]:
                print(f"    {app[:3]}  {h['file']}@{h['at']}  {h['text'][:120]}")

    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "generator": os.path.abspath(__file__),
           "note": "Precision pass. A zero means 'not present in the acquired surface', which "
                   "is weaker than 'the product lacks it' — see each pattern's why.",
           "patterns": {p["id"]: {"cap": p["cap"], "why": p["why"], "source": p["re"]} for p in PATTERNS},
           "result": result}
    with open(out_path, "w") as fh:
        json.dump(out, fh, indent=1)
    print(f"\nwritten: {out_path} ({os.path.getsize(out_path):,} bytes)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/home/user/re/analysis-2026-10-30/rea/MINING-PRECISE.json")
