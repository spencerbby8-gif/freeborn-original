// Real route + pure file rules, with explicitly substituted auth/database adapters.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const s={member:{id:'member-fixture',email:'fixture@example.test'},match:{id:'match-fixture',userA:'member-fixture',userB:'peer-fixture',status:'active',unmatchedBy:null},blocked:false,writes:[]};
globalThis.__mediaContract=s;
const virtual={
 '@/lib/app-auth':'export async function getMember(){return globalThis.__mediaContract.member}',
 '@/lib/conversation-access':'export async function isBlockedPair(){return globalThis.__mediaContract.blocked}',
 '@/db':`export const db={select(){const q={from(){return q},where(){return q},limit(){return Promise.resolve(globalThis.__mediaContract.match?[globalThis.__mediaContract.match]:[])}};return q},insert(){return {values(patch){globalThis.__mediaContract.writes.push(patch);return {returning(){return Promise.resolve([{id:'stored-fixture'}])}}}}}}`,
};
const bundle=await build({stdin:{contents:"export * as route from './src/app/api/chat/media/route';export * as files from './src/lib/chat-file';export {createMediaUrlCache} from './src/lib/media-url-cache';",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'local-media-adapters',setup(b){b.onResolve({filter:/^@\/(db|lib\/(app-auth|conversation-access))$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:virtual[a.path],loader:'js'}));}}]});
const {route,files,createMediaUrlCache}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let n=0;function ok(name,fn){fn();console.log(`ok ${++n} - ${name}`);}
function request({name='Guide.pdf',mime='application/pdf',bytes=Buffer.from('%PDF-1.4\nFixture'),kind='file',match='match-fixture',origin='http://local.test'}={}){const f=new FormData();f.append('file',new File([bytes],name,{type:mime}));f.append('kind',kind);if(match)f.append('match',match);return new Request('http://local.test/api/chat/media',{method:'POST',headers:{origin},body:f});}
let r=await route.POST(request());ok('PDF upload reaches real handler and records authenticated sender, match, kind and bytes',()=>{assert.equal(r.status,200);assert.equal(s.writes[0].senderId,s.member.id);assert.equal(s.writes[0].matchId,'match-fixture');assert.equal(s.writes[0].kind,'file');assert.equal(s.writes[0].mime,'application/pdf');});
for(const [name,opts] of [['HTML executable',{name:'index.html',mime:'text/html',bytes:Buffer.from('<script>alert(1)</script>')}],['forged PDF',{name:'fake.pdf',bytes:Buffer.from('<html>not pdf</html>')}],['forged Office',{name:'fake.docx',bytes:Buffer.from('not a zip')}],['empty document',{bytes:Buffer.from('')}],['oversize document',{bytes:Buffer.alloc(files.CHAT_FILE_MAX+1)}],['binary text',{name:'notes.txt',bytes:Buffer.from([1,0,2])}],['missing match',{match:''}]]){const before=s.writes.length;r=await route.POST(request(opts));ok(`${name} is rejected without persistence`,()=>{assert.equal(r.status,400);assert.equal(s.writes.length,before);});}
s.blocked=true;r=await route.POST(request());ok('blocked recipient cannot receive uploads',()=>assert.equal(r.status,403));s.blocked=false;
s.match.status='unmatched';r=await route.POST(request());ok('unmatched conversation is upload-read-only',()=>assert.equal(r.status,403));s.match.status='active';
s.match=null;r=await route.POST(request());ok('nonparticipant/missing match cannot upload',()=>assert.equal(r.status,404));
s.member=null;r=await route.POST(request());ok('unsigned user cannot upload',()=>assert.equal(r.status,401));
s.member={id:'member-fixture',email:'fixture@example.test'};r=await route.POST(request({origin:'https://evil.test'}));ok('cross-origin browser upload is refused',()=>assert.equal(r.status,403));
for(const [ext,mime]of Object.entries(files.CHAT_FILE_TYPES)){ok(`allowed ${ext} type remains explicit`,()=>assert.equal(files.chatFileMime('file.'+ext),mime));}
ok('download filename cannot contain slash or marker/control injection',()=>assert.equal(files.safeChatFilename('../bad|[name]\n.pdf'),'.._bad__name__.pdf'));
ok('UTF-8 plain text accepted',()=>assert.equal(files.validChatFileBytes('text/plain',Buffer.from('A walk — Saturday')),true));
ok('Office ZIP signature accepted without executing contents',()=>assert.equal(files.validChatFileBytes(files.CHAT_FILE_TYPES.docx,Buffer.from([80,75,3,4,1])),true));
const resolves=[],revoked=[];const cache=createMediaUrlCache(()=>new Promise(resolve=>resolves.push(resolve)),u=>revoked.push(u));
const first=cache.acquire('same');const also=cache.acquire('same');
ok('two live media views share one authenticated fetch',()=>{assert.equal(first,also);assert.equal(resolves.length,1);});
cache.release('same');ok('closing one media view does not revoke a shared URL',()=>assert.equal(revoked.length,0));
cache.release('same');const second=cache.acquire('same');resolves[1]('blob:new');await second;resolves[0]('blob:retired');await first;
ok('a retired in-flight URL is revoked, never installed into a new generation',()=>assert.deepEqual(revoked,['blob:retired']));
cache.release('same');ok('the new media URL is revoked exactly once when its last view closes',()=>assert.deepEqual(revoked,['blob:retired','blob:new']));
console.log(`PASS ${n} local media contract assertions; no hosted RLS/database acceptance.`);
delete globalThis.__mediaContract;
