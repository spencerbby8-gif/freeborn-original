#!/usr/bin/env node
/**
 * Regenerates public/prototype/ from this folder.
 *
 * Why one level of path rewriting: Next serves public/prototype/index.html at
 * `/prototype` (no trailing slash, for the .html variant Next normalises).
 * Relative URLs in the mock (`app.js`, `assets/…`) then resolve against `/`,
 * not against `/prototype/`, and the app never boots. One `<base href="/prototype/">`
 * injected after <head> fixes document-relative URLs; CSS url()s resolve against the
 * stylesheet (which the base fixes for the document and statically), so no path
 * edits inside styles.css/app.js are needed.
 *
 * Usage: node prototype/sync-public.mjs
 */
import { cpSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL(".", import.meta.url).pathname;
const DEST = join(SRC, "..", "public", "prototype");

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
for (const f of ["index.html", "styles.css", "app.js"]) copyFileSync(join(SRC, f), join(DEST, f));
cpSync(join(SRC, "assets"), join(DEST, "assets"), { recursive: true });

const html = readFileSync(join(DEST, "index.html"), "utf8");
if (!html.includes('<base href="/prototype/">')) {
  if (!html.includes("<head>")) throw new Error("index.html has no <head> — refusing to guess");
  writeFileSync(join(DEST, "index.html"), html.replace("<head>", '<head>\n<base href="/prototype/">'));
}
console.log("public/prototype synced (base href=/prototype/ injected)");
