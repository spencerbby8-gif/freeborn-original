import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const built=await build({entryPoints:['src/lib/free-dating-content.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const content=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const {FREE_DATING_PATH:path,freeDatingFeatures:features,freeDatingQuestions:faq}=content;
const read=file=>readFileSync(file,'utf8');const page=read('src/app/free-dating/page.tsx');
let n=0;const checks=[];function check(name,fn){fn();checks.push(name);console.log(`ok ${++n} - ${name}`)}
check('canonical intent has one destination',()=>assert.equal(path,'/free-dating'));
check('six explicit features, unique identifiers',()=>{assert.equal(features.length,6);assert.equal(new Set(features.map(f=>f.id)).size,6)});
for(const feature of features)check(feature.id+' includes a limitation, not just a sales claim',()=>{assert.ok(feature.boundary.length>40);assert.equal(feature.access,'Included')});
check('FAQ questions are unique',()=>{assert.equal(faq.length,8);assert.equal(new Set(faq.map(f=>f.q)).size,8)});
check('access copy distinguishes current from permanent pricing',()=>{assert.match(faq[0].a,/current access/);assert.match(faq[0].a,/not a permanent pricing promise/)});
check('FAQ describes unavailable planned membership',()=>{assert.match(faq[5].a,/not an available purchase/);assert.match(faq[5].a,/does not currently take a payment/)});
check('FAQ explicitly denies guaranteed local supply and safe verification',()=>{assert.match(faq[4].a,/does not promise local matches/);assert.match(faq[6].a,/not a background check/)});
check('page visible FAQs and JSON-LD use the same source',()=>{assert.ok((page.match(/freeDatingQuestions\.map/g)||[]).length===2);assert.match(page,/JSON\.stringify\(faqData\)\.replace/)});
check('no rating/review/offer markup manufactured on product page',()=>assert.doesNotMatch(page,/AggregateRating|ReviewCount|priceCurrency|OfferCatalog/));
check('no answer collector, simulated member or new tracking integration',()=>assert.doesNotMatch(page,/<form\b|<input\b|<textarea\b|fetch\(|localStorage|sessionStorage|sendBeacon|<iframe\b/));
check('all onboarding CTAs use the real signup mode',()=>{assert.match(page,/const signup = '\/auth\?mode=sign-up'/);assert.equal((page.match(/href=\{signup\}/g)||[]).length,2)});
const site=read('src/lib/site.ts');const block=/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/.exec(site)?.[1]||'';
check('one dated sitemap allowlist entry',()=>{assert.equal((block.match(/path: "\/free-dating"/g)||[]).length,1);assert.match(block,/path: "\/free-dating"[^\n]+lastModified: "\d{4}-\d{2}-\d{2}"/)});
for(const file of ['src/components/landing/footer.tsx','src/app/guides/page.tsx','src/app/guides/relationship-values-questions/page.tsx'])check('linked from '+file,()=>assert.ok(read(file).includes('"/free-dating"')));
const sources={
 start:'src/app/api/chat/start/route.ts',messages:'src/app/api/chat/messages/route.ts',media:'src/app/api/chat/media/route.ts',likes:'src/app/api/likes/route.ts',discovery:'src/app/api/profiles/route.ts',membership:'src/components/prototype/settings.tsx',reciprocity:'src/lib/conversation-access.ts',lifecycle:'src/lib/match-lifecycle.ts',onboarding:'src/app/api/onboarding/complete/route.ts',faq:'src/components/landing/faq.tsx',auth:'src/app/auth/page.tsx',city:'src/lib/city-pages.ts',robots:'src/app/robots.ts',badge:'src/lib/discovery-presentation.ts',
};
const source=Object.fromEntries(Object.entries(sources).map(([key,file])=>[key,read(file)]));
check('start implementation checks mutual interest and blocks',()=>{assert.match(source.start,/if \(!\(await hasMutualLike/);assert.match(source.start,/if \(await isBlockedPair/);assert.match(source.start,/other\.messagePrivacy/)});
check('message implementation still checks membership, status and privacy',()=>{assert.match(source.messages,/if \(!member\)/);assert.match(source.messages,/ownsMatch\(matchId, member\.id, "send_message"\)/);assert.match(source.messages,/if \(await isBlockedPair/);assert.match(source.messages,/other\?\.messagePrivacy/)});
check('reciprocity is bilateral not a scripted match',()=>assert.match(source.reciprocity,/return ab && ba/));
check('media formats, size and rate checks remain actual conditions',()=>{assert.match(source.media,/voice:/);assert.match(source.media,/image:/);assert.match(source.media,/file\.size > rule\.maxBytes/);assert.match(source.media,/rateLimited\(member\.id/)});
check('discovery refuses anonymous access',()=>assert.match(source.discovery,/if \(!viewer\)[\s\S]{0,130}status: 401/));
check('planned membership does not pretend to be purchasable',()=>{assert.match(source.membership,/These plans are not live or purchasable/);assert.match(source.membership,/No payment was taken and no subscription was created/)});
check('pricing copy aligns with current existing FAQ',()=>assert.match(source.faq,/There is no paid plan available at the moment/));
check('private routes remain excluded by existing robots policy',()=>{for(const value of ['"/app"','"/onboarding"','"/api/"','"/discover"'])assert.ok(source.robots.includes(value))});
check('city system still uses a threshold and market allowlist',()=>{assert.match(source.city,/MIN_MEMBERS_PER_CITY = 5/);assert.match(source.city,/ALLOWED_COUNTRY_CODES/)});
check('claim ledger exists for review',()=>assert.ok(existsSync('docs/growth/FREE-DATING-CLAIM-LEDGER.md')));
const output=process.env.FREE_DATING_EVIDENCE_DIR;
if(output){mkdirSync(output,{recursive:true});writeFileSync(output+'/source-contracts.json',JSON.stringify({checks:n,results:checks,sourceHashes:Object.fromEntries(Object.entries(sources).map(([,file])=>[file,createHash('sha256').update(read(file)).digest('hex')])),scope:'Static source contracts and copy invariants only; no proof of live production operation or actual search results.'},null,2)+'\n')}
console.log(`PASS ${n} free-dating copy/source contracts. Static checks are not end-to-end production proof.`);
