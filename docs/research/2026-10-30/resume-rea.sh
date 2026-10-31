#!/usr/bin/env bash
# Restore + verify the REA analysis toolchain after a snapshot reset.
#
# Why this exists: the workspace snapshot (cap ~128 MB, see the exclusion list in the
# agent contract) drops node_modules and any extracted node directory. That is the
# intended trade — third-party bytes are reinstallable, the evidence is not. This script
# puts the toolchain back in ONE command so a resumed run never re-acquires bundles or
# re-picks a node version by accident.
#
# CHANGED 2026-10-30: node now extracts to $HOME/.local/toolchain, NOT into
# analysis-2026-10-29/ as rebuild-toolchain.sh did. `.local` is snapshot-excluded, so a
# ~200 MB node tree can no longer push the turn-end snapshot over its cap and silently
# evict out/ evidence — which is the failure mode that cost the 2026-10-29 per-file run.
set -u

TC=${TC:-/home/user/.local/toolchain}
NODE_DIR=$TC/node-v24.22.1-linux-x64
TARBALL=/home/user/re/node24.tar.xz
REA=${REA:-/home/user/re/rea/node_modules/.bin/rea}
OUT=/home/user/re/analysis-2026-10-30/rea
LOGFILE=$OUT/commands/restore-$(date -u +%Y%m%dT%H%M%SZ).log
mkdir -p "$OUT/commands" "$OUT/perfile"

exec > >(tee -a "$LOGFILE") 2>&1
echo "\$ date -u:                 $(date -u +%FT%TZ)"
echo "\$ uname:                   $(uname -m)"

# ── 1. node ─────────────────────────────────────────────────────────────────
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "\$ tar -xJf $TARBALL -C $TC"
  mkdir -p "$TC"
  tar -xJf "$TARBALL" -C "$TC"
  echo "exit=$?"
fi
export PATH="$NODE_DIR/bin:$PATH"
echo "node: $(node -v)   npm: $(npm -v)"
echo "   REA engines wants ^22.23.4 || ^24.22.1 || >=26.12.1 — v20 refuses with"
echo "   'node:zlib does not provide an export named zstdDecompress'. Pinned v24.22.1."

# ── 2. rea ──────────────────────────────────────────────────────────────────
if [ ! -x "$REA" ]; then
  echo "\$ (cd /home/user/re/rea && npm ci --no-audit --no-fund)   # pinned rea-agents@6.8.0"
  (cd /home/user/re/rea && npm ci --no-audit --no-fund)
  echo "exit=$?"
  echo "   Pin matters: the evidence bundles and the numbers quoted in"
  echo "   REA-BUMBLE-HINGE-ANALYSIS.md were produced by 6.8.0; another version"
  echo "   changes the evidence schema and the figures stop matching."
fi
echo "\$ $REA --version"
"$REA" --version; echo "exit=$?"

# ── 3. bundle integrity, against the acquisition manifest ───────────────────
echo
echo "=== bundle integrity: sha256 of every acquired file vs _manifest.json ==="
python3 - <<'PY'
import hashlib, json, os, sys, time
root = "/home/user/re/analysis-2026-10-29"
outdir = "/home/user/re/analysis-2026-10-30/rea"
lines, report = [], []
checked = mismatch = missing = 0
for app in sorted(os.listdir(root)):
    d = os.path.join(root, app)
    if not os.path.isdir(d):
        continue
    manp = os.path.join(d, "_manifest.json")
    if not os.path.exists(manp):
        report.append(f"{app}: NO _manifest.json — files present but unattested by an acquisition manifest")
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if os.path.isfile(p):
                h = hashlib.sha256(open(p, "rb").read()).hexdigest()
                lines.append(f"{h}  {app}/{f}")
                report.append(f"  {app}/{f}: {h[:16]}… (no manifest entry)")
        continue
    man = json.load(open(manp))
    files = man["files"] if isinstance(man, dict) and "files" in man else man
    for rec in files:
        name = rec.get("file") or rec.get("path")
        if not name:
            continue
        p = os.path.join(d, name)
        if not os.path.exists(p):
            missing += 1
            report.append(f"  MISSING {app}/{name}")
            continue
        got = hashlib.sha256(open(p, "rb").read()).hexdigest()
        want = rec.get("sha256")
        checked += 1
        if want and want != got:
            mismatch += 1
            report.append(f"  DIGEST MISMATCH {app}/{name}")
        lines.append(f"{got}  {app}/{name}")
    # every file on disk that the manifest does NOT list must be said out loud,
    # otherwise "all digests match" quietly means "all digests I looked at match".
    listed = {(r.get("file") or r.get("path")) for r in files}
    extra = [f for f in sorted(os.listdir(d))
             if os.path.isfile(os.path.join(d, f)) and f not in listed]
    for f in extra:
        p = os.path.join(d, f)
        lines.append(f"{hashlib.sha256(open(p,'rb').read()).hexdigest()}  {app}/{f}")
    if extra:
        report.append(f"  {app}: {len(extra)} file(s) on disk not listed in _manifest.json: {', '.join(extra)}")

# bundles/ holds the raw acquisition HTML for all three apps
bd = "/home/user/re/bundles"
if os.path.isdir(bd):
    for f in sorted(os.listdir(bd)):
        p = os.path.join(bd, f)
        if os.path.isfile(p):
            # ../bundles/ so that `sha256sum -c` from analysis-2026-10-29 resolves it too
            lines.append(f"{hashlib.sha256(open(p,'rb').read()).hexdigest()}  ../bundles/{f}")

os.makedirs(outdir, exist_ok=True)
with open(os.path.join(outdir, "SHA256SUMS"), "w") as fh:
    fh.write("# SHA256 of every reverse-engineering input, computed %s.\n" % time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    fh.write("# Source of truth for the per-file digests: analysis-2026-10-29/<app>/_manifest.json,\n")
    fh.write("# written by acquire.mjs at download time from the bytes actually fetched.\n")
    fh.write("# Verify with: (cd /home/user/re/analysis-2026-10-29 && sha256sum -c ../analysis-2026-10-30/rea/SHA256SUMS)\n")
    fh.write("\n".join(sorted(lines)) + "\n")
print(f"manifest: {len(lines)} digests -> {outdir}/SHA256SUMS")
print(f"checked={checked} mismatch={mismatch} missing={missing}")
for r in report:
    print("  " + r)
PY
echo "exit=$?"

# ── 4. point the campaign at this toolchain ─────────────────────────────────
echo
echo "=== the per-file campaign runner uses PATH for node; pinning it to $NODE_DIR/bin ==="
sed -i "s#^export PATH=.*#export PATH=$NODE_DIR/bin:\$PATH   # restored by resume-rea.sh#" /home/user/re/rea-perfile.sh
grep -n "^export PATH" /home/user/re/rea-perfile.sh

echo
echo "Toolchain ready. Next:"
echo "  bash /home/user/re/rea-perfile.sh bumble hinge      # resumable, one REA call per file"
echo "  (evidence -> $OUT/perfile/, which is what the 2026-10-29 run lost)"
