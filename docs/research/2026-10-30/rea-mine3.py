#!/usr/bin/env python3
"""Third pass: API surface, state management, media pipeline and failure handling.

Same discipline as mine2: every pattern must be unambiguous in isolation, every hit
carries file + byte offset, and a zero is reported as 'absent from these bytes'.
Added for this turn: the newly acquired Tinder app bundles (main / tinderapp / vendor /
79047 / pc-webpack-runtime, 2.3 MB) and Bumble's stylesheet, which is where the UI
tokens come from. Hinge contributes only its 2026-10-29 JS (its CSS host is
unreachable from this sandbox, recorded as a gap).
"""
import glob, hashlib, json, os, re, sys, time

P = [
 ("api_path",       r'"(/(?:v\d+(?:\.\d+)?/[a-z0-9_./-]{3,48}|api/[a-z0-9_./-]{3,48}))"', "A versioned or /api/ path literal in client code -> endpoint namespace the client calls."),
 ("gql_op",         r'"(query|mutation)\s+([A-Za-z][\w]{3,40})"', "Named GraphQL operation in the client -> the operation inventory is visible even though the resolver is not."),
 ("rest_verb_use",  r"\.(?:fetch|axios)\s*\(\s*[^)]{0,60}\{\s*method\s*:\s*[\"'](POST|PUT|PATCH|DELETE)", "Explicit non-GET call with a JSON body -> write surface."),
 ("http_lib",       r"\b(axios|superagent|whatwg-fetch|ky\.create|got\.extend|ofetch)\b|createFetchClient|got\(", "HTTP client library in use."),
 ("retry_policy",   r"(maxRetries|retryDelay|shouldRetry|attemptNumber|exponential|backoff|retryAfter|Retry-After)\s*[:=]?\s*[^,;{}]{0,24}", "Retry knobs with their configured values."),
 ("status_handling",r"(?:status|statusCode)\s*===?\s*(401|403|404|409|413|422|429|500|502|503)\b", "Specific HTTP statuses the client branches on -> the failure contract."),
 ("offline_queue",  r"(queue|pending|outbox)[\w-]{0,12}\.(?:push|concat)\(|navigator\.onLine|offline[\w-]{0,10}\s*(?:=|\?)", "Client-side buffering of work while offline."),
 ("upload_form",    r"new FormData\(\)[^;]{0,120}append\(\s*[\"'](\w+)", "Multipart upload with the actual field name -> the shape the receiver validates."),
 ("signed_upload",  r"(presigned|signedUrl|signed_url|uploadUrl|x-amz-credential|X-Amz-Signature|policy\s*:\s*[\"']base64)", "Direct-to-storage upload with a signature handed out by the API."),
 ("chunk_upload",   r"(partNumber|uploadId|completeMultipartUpload|createMultipartUpload|chunkSize\s*[:=]\s*\d+|resumable(?!State))", "Multipart/resumable upload machinery."),
 ("img_optimize",   r"(/_next/image|images?/[a-z0-9_-]{4,24}\?(?:[^\"'&]{0,40}(?:width|quality|format|auto)[=&]))|w_\d+|q_\d{2}|fm=(?:webp|avif)", "On-the-fly image transforms expressed in the URL."),
 ("blob_preview",   r"URL\.createObjectURL\(", "Local object-URL preview of a picked file."),
 ("canvas_resize",  r"(?:getContext\([\"']2d[\"']\)|createImageBitmap|OffscreenCanvas)[\s\S]{0,180}?(drawImage|convertToBlob|toBlob|toDataURL)", "Client-side downscale/re-encode before upload."),
 ("exif_strip",     r"(orientation|EXIF|exif-|removeExif|auto-orient|rotate\s*[=:]\s*(?:0|90|180|270))", "Orientation/EXIF handling on the client."),
 ("state_lib",      r"\b(createSlice|configureStore|createStore|combineReducers|createAsyncThunk|redux-saga|createSelector|zustand|create\(\s*\(set\)|jotai|recoil|useStore)\b", "State management primitives."),
 ("cache_lib",      r"(useQuery|useMutation|queryClient|QueryClientProvider|cacheTime|staleTime|invalidateQueries|setQueryData)", "Server-state cache with explicit staleness/invalidation."),
 ("storage_persist",r"(localStorage|sessionStorage|indexedDB)\.(?:setItem|getItem|open)\(\s*[\"']([\w:.-]{2,48})", "Persistence with the key literal -> what survives a reload."),
 ("form_errors",    r"(setErrors|errors\[([a-z_]+)\]|formError|errorMessage|validationError)", "Field-level error surfacing."),
 ("optimistic",     r"(optimisticResponse|optimisticUpdate|onMutate|rollback|revert\()", "Optimistic mutation with a rollback path."),
 ("pagination",     r"(cursor|pageAfter|offset|limit|pageSize|hasMore|nextPageToken|starts?With)\s*[:=]", "Windowing parameters for lists/decks."),
 ("rate_limit",     r"(429|rate.?limit|too many requests|retry_after|throttle)", "Rate-limit handling in the client."),
 ("presence",       r"(activeNow|lastActive|seenAt|readAt|deliveredAt|typing[A-Z]?|isOnline)", "Presence/read-receipt fields the client renders."),
 ("media_meta",     r"(durationMs|duration_milliseconds|width\s*:\s*\w+\s*,\s*height|blurhash|lqip|dominantColor|palette)", "Derived media metadata the client reads for layout/placeholders."),
 ("swipe_gesture",  r"(onPan|useGesture|drag\w*\s*[:=]|framer-motion|react-spring|useDrag|pointerdown)", "Gesture machinery behind card interactions."),
]

def files():
    roots = {
      "bumble": ["/home/user/re/analysis-2026-10-29/bumble/*.js", "/home/user/re/analysis-2026-10-30/acquired-2026-10-30T/bumble.*"],
      "hinge":  ["/home/user/re/analysis-2026-10-29/hinge/*.js"],
      "tinder": ["/home/user/re/analysis-2026-10-30/acquired-2026-10-30T/tinder.*"],
    }
    for app, pats in roots.items():
        for pat in pats:
            for f in sorted(glob.glob(pat)):
                yield app, f

def main(out_path):
    agg = {}
    for app, f in files():
        raw = open(f, encoding="utf8", errors="replace").read()
        name = os.path.basename(f)
        for pid, pat, why in P:
            for m in re.finditer(pat, raw, re.I):
                frag = re.sub(r"\s+", " ", raw[max(0, m.start()-45):m.end()+55])[:150]
                key = f"{app}:{pid}"
                agg.setdefault(key, {"why": why, "count": 0, "files": {}, "samples": []})
                a = agg[key]; a["count"] += 1
                a["files"][name] = a["files"].get(name, 0) + 1
                if len(a["samples"]) < 4:
                    a["samples"].append({"file": name, "at": m.start(), "text": frag})
    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "generator": os.path.abspath(__file__),
           "note": "Counts are string/API surface facts in shipped client bytes. They do not describe server behaviour.",
           "findings": {k: v for k, v in sorted(agg.items(), key=lambda kv: (-kv[1]["count"]))}}
    json.dump(out, open(out_path, "w"), indent=1)
    apps = ["bumble", "hinge", "tinder"]
    pids = [p[0] for p in P]
    print(f"{'pattern':17}" + "".join(f"{a:>10}" for a in apps) + "   what it proves")
    for pid in pids:
        row = []
        for a in apps:
            v = out["findings"].get(f"{a}:{pid}")
            row.append(v["count"] if v else 0)
        why = next(p[2] for p in P if p[0] == pid)
        print(f"{pid:17}" + "".join(f"{c:>10}" for c in row) + f"   {why[:58]}")
    print(f"\nwritten: {out_path} ({os.path.getsize(out_path):,} B)")
    print("=== the three most decision-relevant rows, with offsets ===")
    for pid in ["signed_upload", "status_handling", "cache_lib"]:
        for a in apps:
            v = out["findings"].get(f"{a}:{pid}")
            if v:
                print(f"  {a}/{pid} n={v['count']}")
                for s in v["samples"][:2]:
                    print(f"     {s['file']}@{s['at']}  {s['text'][:132]}")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/home/user/re/analysis-2026-10-30/rea/MINING-API-STATE.json")
