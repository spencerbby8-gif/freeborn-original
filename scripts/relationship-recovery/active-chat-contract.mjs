import {build} from 'esbuild';import assert from 'node:assert/strict';
const b=await build({entryPoints:['src/lib/active-chat.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {holdActiveChat,isActiveChat}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const old=holdActiveChat('a'),newer=holdActiveChat('b'),second=holdActiveChat('a');assert.equal(isActiveChat('a'),true);old();old();assert.equal(isActiveChat('a'),true);assert.equal(isActiveChat('b'),true);second();assert.equal(isActiveChat('a'),false);assert.equal(isActiveChat('b'),true);newer();assert.equal(isActiveChat('b'),false);console.log('PASS overlapping thread holds and idempotent cleanup remain independent');
