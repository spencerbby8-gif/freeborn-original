// Fail CI when a real-looking credential is present in the tracked tree.
// Historical blobs are out of scope (see SECURITY.md); this gates the future.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const allow = new Set([".env.example", "SECURITY.md", "README.md", "DEPLOY.md", "db/migrations/2026-10-27-audit-f1-f10.sql"]);
const patterns = [
  { name: "GitHub PAT", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "Netlify PAT", re: /nfp_[A-Za-z0-9]{20,}/ },
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9_\-]{10,}/ },
  { name: "Antigravity key", re: /agy_[A-Za-z0-9]{10,}/ },
  { name: "pooler URL with password", re: /postgresql:\/\/postgres[^:@\s]*:[^@\s]{6,}@[^\s]*pooler\.supabase\.com/ },
  { name: "service-role JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*role[\"']?\s*[:=]\s*[\"']?service_role/ },
];
const hits = [];
for (const f of files) {
  if (allow.has(f)) continue;
  let body;
  try { body = readFileSync(f, "utf8"); } catch { continue; }
  for (const p of patterns) {
    p.re.lastIndex = 0;
    if (p.re.test(body)) hits.push(`${f}: ${p.name}`);
  }
}
if (hits.length) {
  console.error("SECRET SCAN FAILED:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`secret scan OK — ${files.length} tracked files scanned`);
