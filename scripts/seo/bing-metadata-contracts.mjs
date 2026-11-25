// Pure source contracts, no network, webmaster account, ranking or deployment claim.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const result=await build({stdin:{contents:"export {EDITORIAL_DESCRIPTIONS} from './src/lib/editorial-descriptions';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {EDITORIAL_DESCRIPTIONS:descriptions}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const registry=readFileSync('src/lib/site.ts','utf8').match(/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/)?.[1]??'';
const paths=new Set([...registry.matchAll(/path: "([^"]+)"/g)].map(m=>m[1]));
const seen=new Set();let n=0;
function check(name,fn){fn();console.log(`PASS ${++n} ${name}`)}
check('Every repaired path has one curated description',()=>assert.equal(Object.keys(descriptions).length,11));
for(const [path,text] of Object.entries(descriptions))check('Description policy: '+path,()=>{
 assert(paths.has(path),'Not a public editorial path');assert.equal(typeof text,'string');
 const length=Array.from(text).length;assert(length>=25&&length<=160,`Bing tool range: ${length}`);
 assert.equal(text.trim(),text);assert(!seen.has(text),'Duplicate description');seen.add(text);
 assert(!/[<>]|&(?:amp|quot);|\ufffd|Â·/.test(text),'Markup/encoding artifact');
});
for(const [file,path] of [
 ['src/lib/free-dating-content.ts','/free-dating'],
 ['src/components/legal/privacy-document.tsx','/privacy'],
 ['src/components/legal/terms-document.tsx','/terms'],
 ['src/components/legal/cookies-document.tsx','/cookies'],
 ['src/app/alternatives/page.tsx','/alternatives'],
 ['src/app/guides/page.tsx','/guides'],
 ...Object.keys(descriptions).filter(p=>p.startsWith('/guides/')).map(p=>['src/lib/dating-guides.ts',p]),
])check('Source references shared description: '+path,()=>assert(readFileSync(file,'utf8').includes(`EDITORIAL_DESCRIPTIONS['${path}']`)));
check('The member four-tab source is not involved in metadata repair',()=>assert(!readFileSync('src/components/prototype/frame.tsx','utf8').includes('EDITORIAL_DESCRIPTIONS')));
console.log(`PASS ${n} metadata source contracts. Actual generated HTTP metadata is checked separately by bing-metadata-audit.py; no index coverage claim.`);
