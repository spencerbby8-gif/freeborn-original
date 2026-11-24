/** Read-only public crawl health. Never submits URLs or claims engine index coverage.
 * node scripts/seo/crawl-health.mjs [--origin=https://freeborndating.com] [--output=report.json]
 */
import {writeFileSync,readFileSync} from 'node:fs';
const arg=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const origin=new URL(arg('origin')??'https://freeborndating.com');
if(!['https://freeborndating.com','http://127.0.0.1:3000','http://localhost:3000'].includes(origin.origin))throw Error('Only canonical production or explicit loopback development origin allowed');
const source=readFileSync(new URL('../../src/lib/site.ts',import.meta.url),'utf8');
const block=/export const INDEXABLE_PATHS = \[([\s\S]*?)\];/.exec(source)?.[1]??'';
const paths=[...block.matchAll(/path: "([^"]+)"/g)].map(m=>m[1]);
if(!paths.length)throw Error('No editorial paths parsed');
const results=[];const failures=[];
async function fetchText(path){
 const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(25000),redirect:'manual',headers:{'User-Agent':'FreebornPublicHealth/1.0'}});
 const body=await response.text();
 const record={path,status:response.status,contentType:response.headers.get('content-type'),xRobotsTag:response.headers.get('x-robots-tag')};results.push(record);
 if(response.status!==200)failures.push(`${path}: HTTP ${response.status}`);
 return {body,record};
}
function tagValue(html,tag,key,value,attribute){
 const tags=html.match(new RegExp(`<${tag}\\b[^>]*>`,'gi'))??[];
 const candidate=tags.find(t=>new RegExp(`\\b${key}=["']${value}["']`,'i').test(t));
 return candidate?.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`,'i'))?.[1]??null;
}
try{
 const {body:robots}=await fetchText('/robots.txt');
 if(!robots.includes('https://freeborndating.com/sitemap.xml'))failures.push('robots.txt: canonical sitemap missing');
 for(const path of ['/app','/api/','/discover'])if(!robots.includes(`Disallow: ${path}`))failures.push(`robots.txt: privacy exclusion missing ${path}`);
 const {body:sitemap}=await fetchText('/sitemap.xml');
 const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 if(!urls.length)failures.push('sitemap empty');
 for(const url of urls){const u=new URL(url);if(u.origin!=='https://freeborndating.com'||/^\/(app|api|auth|onboarding|discover)(\/|$)/.test(u.pathname))failures.push(`sitemap unsafe/noncanonical URL ${url}`)}
 for(const path of paths){
  const {body,record}=await fetchText(path);
  const canonical=tagValue(body,'link','rel','canonical','href');record.canonical=canonical;
  record.robots=tagValue(body,'meta','name','robots','content');
  record.title=body.match(/<title>(.*?)<\/title>/is)?.[1]??null;
  const expected=new URL(path,'https://freeborndating.com').href.replace(/\/$/,'');
  if(canonical?.replace(/\/$/,'')!==expected)failures.push(`${path}: canonical mismatch ${canonical}`);
  if(!record.title)failures.push(`${path}: missing title`);
  if(/noindex/i.test(`${record.robots??''} ${record.xRobotsTag??''}`))failures.push(`${path}: public page noindexed`);
  if(!urls.some(url=>url.replace(/\/$/,'')===expected))failures.push(`${path}: absent from sitemap`);
 }
 for(const path of ['/auth','/app']){const {body,record}=await fetchText(path);record.robots=tagValue(body,'meta','name','robots','content');if(!/noindex/i.test(`${record.robots??''} ${record.xRobotsTag??''}`))failures.push(`${path}: missing noindex`)}
}catch(error){failures.push(error.message)}
const report={checkedAt:new Date().toISOString(),origin:origin.origin,scope:'Anonymous HTTP crawl signals only; not rankings, verified crawler visits, Search Console ownership or index coverage.',results,failures,ok:failures.length===0};
const json=JSON.stringify(report,null,2);if(arg('output'))writeFileSync(arg('output'),json+'\n');console.log(json);process.exitCode=report.ok?0:1;
