// Source inventory only: checks exported function-form mutation handlers.
// Machine-authenticated scheduler and signed email webhook do not use browser Origin.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const root='src/app/api',exceptions=new Set(['src/app/api/internal/email-dispatch/route.ts','src/app/api/email/webhook/route.ts']);
async function* walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* walk(p);else if(e.name==='route.ts')yield p}}
let checked=0,exempt=0;const failures=[];
for await(const file of walk(root)){const source=await readFile(file,'utf8');for(const m of source.matchAll(/export\s+(?:async\s+)?function\s+(POST|PATCH|PUT|DELETE)\s*\([^)]*\)\s*\{/g)){
 if(exceptions.has(file)){exempt++;continue}checked++;const prefix=source.slice(m.index+m[0].length,m.index+m[0].length+500);if(!prefix.includes('rejectCrossOrigin('))failures.push(`${file}: ${m[1]}`);
}}
assert.ok(checked>=9,'unexpectedly few mutation handlers examined');if(failures.length){console.error('FAIL missing early guard:',failures.join(', '));process.exitCode=1}else console.log(`PASS ${checked} exported function-form mutating handlers contain an early origin guard; ${exempt} machine-authenticated handler exceptions`);
console.log('LIMIT: static inventory, not a proof of route execution, alternate export forms, trusted proxies or hosted configuration.');
