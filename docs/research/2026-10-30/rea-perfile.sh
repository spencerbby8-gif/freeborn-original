#!/usr/bin/env bash
# REA per-file campaign over the acquired competitor bundles.
# One REA invocation per inventoried source file, so a single huge chunk cannot
# truncate the whole site's evidence (that is exactly what happened to the first
# directory-wide run). Persistent per-file log + per-file evidence bundle.
set -u
export PATH=${NODE_BIN:-/home/user/.local/toolchain/node-v24.22.1-linux-x64/bin}:$PATH   # REA needs node >=22 (v20 refuses: node:zlib has no zstdDecompress)
REA=/home/user/re/rea/node_modules/.bin/rea
OUT=/home/user/re/analysis-2026-10-30/rea/perfile
HEAP=${HEAP:-768}
TIMEOUT_MS=${TIMEOUT_MS:-180000}
for site in "$@"; do
  root=${ROOTBASE:-/home/user/re/analysis-2026-10-29}/$site
  [[ -d "$root" ]] || { echo "SKIP $site (no bundle directory)" | tee -a "$OUT/run.log"; continue; }
  python3 - "$root" > "$OUT/$site.files" <<'PY'
import json,sys,pathlib
root=pathlib.Path(sys.argv[1])
man=json.loads((root/"_manifest.json").read_text())
for e in man["files"]:
    f=e.get("file") or e.get("path")
    if f and (f.endswith(".js") or f.endswith(".html")): print(f)
PY
  n=0
  while read -r f; do
    n=$((n+1))
    base=$(echo "$f" | tr '/' '_')
    log="$OUT/${site}__${base}.log"; ev="$OUT/${site}__${base}.evidence.json"
    [[ -s "$ev" ]] && { echo "have $site $f" >> "$OUT/run.log"; continue; }
    "$REA" analyze-javascript-application "$root" --artifact-format directory \
      --source-path "$f" --detail summary --evidence_output "$ev" \
      --analysis-timeout-ms "$TIMEOUT_MS" --max-heap-mb "$HEAP" > "$log" 2>&1
    rc=$?; echo "exit=$rc" >> "$log"
    echo "$site run $n: $f -> rc=$rc $(date -u +%H:%M:%S)" >> "$OUT/run.log"
  done < "$OUT/$site.files"
done
echo "CAMPAIGN DONE $(date -u +%FT%TZ)" >> "$OUT/run.log"
