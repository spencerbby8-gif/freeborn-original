// No credentials or hosted services: execute the production filter store module.
import {build} from 'esbuild';import assert from 'node:assert/strict';
let legacy='sensitive old filters';let writes=0,events=0;
globalThis.window={localStorage:{removeItem(key){assert.equal(key,'freeborn.filters');legacy=null;},setItem(){writes++;}},dispatchEvent(){events++;}};
const built=await build({entryPoints:['src/components/app/filters.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const f=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
assert.equal(f.hasSavedFilters(),false);assert.equal(legacy,null);
const filters={...f.DEFAULT_FILTERS,genders:['woman'],religions:['Christian'],vax:'unvaccinated',occupations:['Teacher']};
f.saveFilters(filters);assert.equal(f.hasSavedFilters(),true);assert.deepEqual(f.loadFilters(),filters);assert.equal(writes,0);assert.equal(events,1);
filters.genders.push('man');assert.deepEqual(f.loadFilters().genders,['woman']);const copy=f.loadFilters();copy.religions.push('Buddhist');assert.deepEqual(f.loadFilters().religions,['Christian']);
assert.equal(f.buildProfileParams(f.loadFilters(),null).get('gender'),'woman');
console.log('PASS filter privacy: legacy data removed, zero browser-storage writes, live choices retained, clone isolation and effective query verified.');
