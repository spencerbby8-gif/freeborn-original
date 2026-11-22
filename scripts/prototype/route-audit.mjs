// Static reachability, not a claim that every runtime interaction was exercised.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),seen=new Set();
const banned=['src/components/app/voice-note.tsx','src/components/app/photo-lightbox.tsx','src/components/app/profile-view.tsx','src/components/app/settings-view.tsx','src/components/app/filter-panel.tsx','src/components/app/likes-view.tsx','src/components/app/home-deck.tsx'];
function resolve(base,spec){let p=spec.startsWith('@/')?path.join(root,'src',spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(base),spec):null;if(!p)return null;return [p,p+'.tsx',p+'.ts',path.join(p,'index.tsx'),path.join(p,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());}
function visit(file){if(seen.has(file))return;seen.add(file);const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/import\s+(?!type\s)[\s\S]*?\sfrom\s+["']([^"']+)["']/g)){const p=resolve(file,m[1]);if(p&&/\.[jt]sx?$/.test(p))visit(p);}}
function pages(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?pages(path.join(dir,e.name)):e.name==='page.tsx'?[path.join(dir,e.name)]:[]);}
const entries=[...pages(path.join(root,'src/app/app')),path.join(root,'src/app/discover/page.tsx')];entries.forEach(visit);
const relative=[...seen].map(p=>path.relative(root,p));const reached=banned.filter(p=>relative.includes(p));assert.deepEqual(reached,[],'Legacy view reachable from member routes');
const badge=fs.readFileSync('src/components/verify-badge.tsx','utf8');assert.ok(badge.includes('#3b9df2')||badge.includes('#3B9DF2'));assert.ok(badge.includes('#fff'));
console.log(JSON.stringify({status:'pass',scope:'Static member-route import reachability, not end-to-end button coverage',entryCount:entries.length,sourceCount:seen.size,bannedLegacyViews:banned,reachedLegacyViews:reached},null,2));
