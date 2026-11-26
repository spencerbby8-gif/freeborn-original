// LOCAL ONLY: real location handler, disposable DB, synthetic Auth; no external IP lookups.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const h=await createHarness({routes:{location:'src/app/api/location/route.ts'}});await h.seed();const q=(s,p=[])=>h.client.query(s,p);let errors=0;
const request=origin=>h.routes.location.POST(new Request('http://fixture.local/api/location',{method:'POST',headers:{authorization:`Bearer ${IDS.a}`,'content-type':'text/plain',...(origin?{origin}:{})},body:JSON.stringify({lat:6.45,lng:7.5,accuracyM:30})}));
try{
 await q('delete from user_private_locations where user_id=$1',[IDS.a]);
 try{const r=await request('https://attacker.example');assert.equal(r.status,403);assert.equal((await q('select count(*)::int n from user_private_locations where user_id=$1',[IDS.a])).rows[0].n,0);console.log('PASS foreign-origin location change rejected before a database write')}catch(e){errors++;console.error('FAIL foreign-origin location: '+e.message)}
 await q('delete from user_private_locations where user_id=$1',[IDS.a]);
 try{const r=await request('http://fixture.local');assert.equal(r.status,200);const row=(await q('select latitude,longitude,source from user_private_locations where user_id=$1',[IDS.a])).rows[0];assert.equal(Number(row.latitude),6.45);assert.equal(Number(row.longitude),7.5);assert.equal(row.source,'gps');console.log('PASS same-origin location saves to the disposable database')}catch(e){errors++;console.error('FAIL same-origin location: '+e.message)}
}finally{await q('delete from user_private_locations where user_id=$1',[IDS.a]);await h.close()}
if(errors)process.exitCode=1;
