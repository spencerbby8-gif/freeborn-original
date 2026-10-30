import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/** Generates public/qa/ (gitignored): the real component bundle + the real emitted CSS. */
await mkdir("public/qa", { recursive: true });

execFileSync(
  "node_modules/.bin/esbuild",
  [
    "scripts/qa/ui-kit.tsx",
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    "--define:process.env.NODE_ENV=\"development\"",
    "--alias:@=./src",
    "--outfile=public/qa/qa.js",
  ],
  { stdio: "inherit" }
);

/* The CSS Next built for the app — same bytes a member's browser receives. Turbopack emits
   it under .next/static/chunks/, not .next/static/css/, so walk the tree and take every
   stylesheet largest-first. */
const seen = [];
const walk = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const f = `${d}/${e.name}`;
    if (e.isDirectory()) await walk(f);
    else if (e.name.endsWith(".css")) seen.push(f);
  }
};
await walk(resolve(".next/static"));
if (!seen.length) throw new Error("no compiled CSS under .next/static — run `npm run build` first");
const sized = [];
for (const f of seen) sized.push([f, (await readFile(f)).length]);
sized.sort((a, b) => b[1] - a[1]);
let css = "";
for (const [f] of sized) css += (await readFile(f, "utf8")) + "\n";
if (!css.includes(".fb-btn"))
  throw new Error("the emitted CSS has no .fb-btn rules — the design layer did not reach the build");
await writeFile("public/qa/qa.css", css);

/* next/font injects the family variables from the app layout's class; replicate the names so
   the type scale is measured against the same font stack the app uses (families fall back to
   system faces here, which is noted in the report). */
await writeFile(
  "public/qa/index.html",
  `<!doctype html><html lang="en" class="font-inter_fraunces"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="./qa.css">
<style>:root{--font-inter:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--font-fraunces:"Iowan Old Style","Palatino Linotype",Georgia,serif}html,body{margin:0;background:#0d0b0a}</style>
</head><body><main class="app-shell"><div id="root"></div></main><script src="./qa.js"></script></body></html>\n`
);
console.log(`built public/qa/ from ${sized.length} emitted stylesheet(s), ${css.length} bytes of CSS`);
