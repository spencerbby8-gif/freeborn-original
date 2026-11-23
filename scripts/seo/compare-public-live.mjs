/** Read-only anonymous local/live comparison. No accounts, analytics, submissions or writes.
 * Local production build must be on port 3002. An expected unreleased difference is not a local test failure.
 * Usage: node scripts/seo/compare-public-live.mjs --output=/path/to/report.json
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
if(!output)throw Error('An output file is required');
const live='https://freeborndating.com',local='http://127.0.0.1:3002';
const source=readFileSync(new URL('../../src/lib/site.ts',import.meta.url),'utf8');
const block=/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/.exec(source)?.[1];
if(!block)throw Error('Cannot identify public allowlist');
const paths=[...block.matchAll(/path: "([^"]+)"/g)].map(v=>v[1]);
const text=value=>value.replace(/<[^>]*>/g,' ').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function attr(html,tag,key,value,wanted){const tags=html.match(new RegExp(`<${tag}\\b[^>]*>`,'gi'))||[];return tags.find(t=>new RegExp(`\\b${key}=["']${value}["']`,'i').test(t))?.match(new RegExp(`\\b${wanted}=["']([^"']*)["']`,'i'))?.[1]??null}
async function inspect(origin,path){
 try{
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(25000),redirect:'manual',headers:{'User-Agent':'FreebornReadOnlyReverification/1.0'}});
  const body=await response.text();const tags=body.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[];
  return {status:response.status,title:text(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||''),h1:tags.map(text),canonical:attr(body,'link','rel','canonical','href'),description:attr(body,'meta','name','description','content'),robots:attr(body,'meta','name','robots','content'),xRobotsTag:response.headers.get('x-robots-tag'),contentType:response.headers.get('content-type'),semanticArticleSha256:createHash('sha256').update(text(body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||body)).digest('hex'),sitemapLocations:path==='/sitemap.xml'?[...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(v=>v[1]):undefined,privacyExclusions:path==='/robots.txt'?['/app','/api/','/discover'].map(p=>({path:p,present:body.includes('Disallow: '+p)})):undefined};
 }catch(error){return {status:null,error:error.message}}
}
const results=[];
for(const path of [...paths,'/robots.txt','/sitemap.xml']){
 const [a,b]=await Promise.all([inspect(local,path),inspect(live,path)]);
 const verdict=a.status!==200?'local_error':b.error?'live_unavailable':b.status!==200?'not_live_at_checked_url':a.semanticArticleSha256===b.semanticArticleSha256?'same_normalized_article_or_main':'live_content_differs';
 results.push({path,local:a,live:b,verdict});console.log(path,a.status,b.status,verdict);
}
const report={observedAt:new Date().toISOString(),localOrigin:local,liveOrigin:live,methods:['GET'],authenticated:false,mutations:0,results,summary:results.reduce((sum,r)=>(sum[r.verdict]=(sum[r.verdict]||0)+1,sum),{}),scope:'Read-only anonymous public HTTP comparison, not deployment identity, account/signup/provider functionality, Search Console ownership, index coverage, rankings, traffic or growth. Differences are recorded, not relabeled as a release.'};
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
process.exitCode=results.some(r=>r.local.status!==200||r.live.error)?1:0;
