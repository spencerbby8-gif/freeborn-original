import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizePublicText} from './public-text.mjs';
const {hasFixtureOrigin}=createRequire(import.meta.url)('../prototype/fixture-preflight.cjs');
let count=0;
function check(name,fn){fn();console.log(`PASS ${++count} ${name}`);}
check('Exact fixture origin literal qualifies',()=>assert.equal(hasFixtureOrigin(['const url="https://fixture.supabase.co";']),true));
check('Canonical trailing slash qualifies',()=>assert.equal(hasFixtureOrigin(["const url='https://fixture.supabase.co/';"]),true));
for(const url of [
 'https://fixture.supabase.co.evil.test',
 'https://evil.test/https://fixture.supabase.co',
 'https://fixture.supabase.co@evil.test',
 'https://evil.test/?next=https://fixture.supabase.co',
 'https://real.supabase.co',
 'http://fixture.supabase.co',
 'https://fixture.supabase.co:8443',
 'https://fixture.supabase.co/not-config',
 'https://fixture.supabase.co/?project=other',
 'https://fixture.supabase.co/#other',
 'https://user:password@fixture.supabase.co',
])check('Reject non-exact or credentialed fixture URL '+url,()=>assert.equal(hasFixtureOrigin([`const url="${url}";`]),false));
check('A URL buried in explanatory text is not a configuration literal',()=>assert.equal(hasFixtureOrigin(['"Expected https://fixture.supabase.co in config"']),false));
check('Missing script sources fail closed',()=>assert.equal(hasFixtureOrigin([]),false));
check('Wrong source container fails closed',()=>assert.equal(hasFixtureOrigin(null),false));
check('Supported HTML entities decode exactly once',()=>assert.equal(normalizePublicText('<p>A &amp; B &quot;C&quot; &#39;D&#x27;</p>'),'A & B "C" \'D\''));
check('Nested quote entity is not decoded twice',()=>assert.equal(normalizePublicText('&amp;quot;'), '&quot;'));
check('Nested apostrophe entity is not decoded twice',()=>assert.equal(normalizePublicText('&amp;#39;'), '&#39;'));
check('Nested ampersand is not decoded twice',()=>assert.equal(normalizePublicText('&amp;amp;'), '&amp;'));
check('Normalization remains plain text, not claimed XSS sanitization',()=>assert.equal(normalizePublicText('<h1> Hello </h1>\n<p>world</p>'),'Hello world'));
console.log(`PASS ${count} evidence-safety contracts; no networking.`);
