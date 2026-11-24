#!/usr/bin/env python3
"""Read-only public editorial audit, stdlib only. Does NOT measure index coverage/ranking.
No auth, profile, discovery or member APIs. Never stores source HTML or member records.
Run: python3 scripts/seo/deep-public-audit.py --output=/path/to/report.json
"""
import argparse
import collections
import concurrent.futures
import hashlib
from html.parser import HTMLParser
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ORIGIN = 'https://freeborndating.com'
AGENT = 'FreebornPublicAudit/1.0 (read-only editorial health check)'
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas = {}; self.canonicals = []; self.headings = []; self.links = []; self.images = []
        self.text = []; self.main_text = []; self.jsonld = []; self.in_main = False
        self.capture = None; self.capture_text = []; self.ignore = 0; self.title = ''
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'):
            self.ignore += 1
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.capture = 'jsonld'; self.capture_text = []
        if tag in ('h1', 'title'):
            self.capture = tag; self.capture_text = []
        if tag == 'main': self.in_main = True
        if tag == 'meta':
            key = a.get('name', a.get('property', '')).lower()
            self.metas.setdefault(key, []).append(a.get('content', ''))
        if tag == 'link' and 'canonical' in a.get('rel', '').split(): self.canonicals.append(a.get('href'))
        if tag == 'a' and a.get('href'): self.links.append(a['href'])
        if tag == 'img': self.images.append({'hasAlt': 'alt' in a, 'emptyAlt': a.get('alt') == ''})
    def handle_endtag(self, tag):
        if (tag in ('h1','title') and self.capture == tag) or (tag == 'script' and self.capture == 'jsonld'):
            value = ' '.join(''.join(self.capture_text).split())
            if self.capture == 'h1': self.headings.append(value)
            elif self.capture == 'title': self.title = value
            else: self.jsonld.append(value)
            self.capture = None; self.capture_text = []
        if tag in ('script','style'): self.ignore = max(0, self.ignore - 1)
        if tag == 'main': self.in_main = False
    def handle_data(self, data):
        if self.capture: self.capture_text.append(data)
        if not self.ignore:
            self.text.append(data)
            if self.in_main: self.main_text.append(data)

def fetch(url, agent=AGENT):
    req = urllib.request.Request(url, headers={'User-Agent': agent, 'Accept': 'text/html,application/xml;q=0.9,*/*;q=0.8'})
    try: response = urllib.request.urlopen(req, timeout=35)
    except urllib.error.HTTPError as error: response = error
    with response:
        raw = response.read(3_000_000)
        return response.status, response.geturl(), {k.lower():v for k,v in response.headers.items()}, raw.decode('utf-8', 'replace')

def flatten_types(value):
    if isinstance(value, dict):
        result = value.get('@type', [])
        if isinstance(result, str): result = [result]
        for child in value.values(): result += flatten_types(child)
        return result
    if isinstance(value, list): return [item for child in value for item in flatten_types(child)]
    return []

def inspect(url):
    status, final, headers, html = fetch(url)
    p = Page(); p.feed(html)
    main = ' '.join(' '.join(p.main_text).split())
    parsed = []; errors = []
    for raw in p.jsonld:
        try: parsed.append(json.loads(raw))
        except (ValueError, TypeError): errors.append('Invalid JSON-LD syntax')
    base = urllib.parse.urlparse(ORIGIN)
    internal = []
    for href in p.links:
        target = urllib.parse.urlparse(urllib.parse.urljoin(url, href))
        if target.scheme in ('http','https') and target.netloc == base.netloc:
            internal.append(target.path.rstrip('/') or '/')
    return {'url':url, 'status':status, 'finalUrl':final, 'canonical':p.canonicals,
            'robots':p.metas.get('robots',[]), 'googlebot':p.metas.get('googlebot',[]),
            'xRobotsTag':headers.get('x-robots-tag'), 'title':p.title,
            'description':p.metas.get('description',[]), 'h1':p.headings,
            'mainWords':len(main.split()), 'mainTextSha256':hashlib.sha256(main.encode()).hexdigest(),
            'internalLinkPaths':sorted(set(internal)), 'jsonLdBlocks':len(parsed),
            'schemaTypes':sorted(set(flatten_types(parsed))), 'jsonLdErrors':errors,
            'images':len(p.images), 'imagesMissingAlt':sum(not i['hasAlt'] for i in p.images),
            'emptyAltImages':sum(i['emptyAlt'] for i in p.images),
            'ogImage':p.metas.get('og:image',[]), 'ogUrl':p.metas.get('og:url',[]),
            'httpContentType':headers.get('content-type')}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    status, _, _, xml = fetch(ORIGIN+'/sitemap.xml')
    if status != 200: raise RuntimeError('Sitemap unavailable')
    urls=[el.text for el in ET.fromstring(xml).iter() if el.tag.endswith('}loc')]
    # Safety: only known public editorial paths. City/member-related URLs require separate review.
    allowed={'/','/free-dating','/safety','/privacy','/terms','/cookies','/alternatives','/guides'}
    editorial=[u for u in urls if urllib.parse.urlparse(u).netloc=='freeborndating.com' and ((urllib.parse.urlparse(u).path or "/") in allowed or urllib.parse.urlparse(u).path.startswith('/guides/'))]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: pages=list(pool.map(inspect, editorial))
    findings=[]
    for page in pages:
        path=urllib.parse.urlparse(page['url']).path or '/'
        if page['status']!=200: findings.append({'path':path,'issue':'non-200'})
        if len(page['canonical'])!=1 or page['canonical'][0].rstrip('/')!=page['url'].rstrip('/'): findings.append({'path':path,'issue':'canonical mismatch'})
        if len(page['h1'])!=1: findings.append({'path':path,'issue':'expected one h1 (editorial heuristic, not indexing requirement)'})
        if not page['description'] or not page['title']: findings.append({'path':path,'issue':'missing title/description'})
        if any('noindex' in value.lower() for value in page['robots']+page['googlebot']+[page['xRobotsTag'] or '']): findings.append({'path':path,'issue':'noindex on intended editorial page'})
        if page['jsonLdErrors']: findings.append({'path':path,'issue':'invalid JSON-LD syntax'})
        if page['imagesMissingAlt']: findings.append({'path':path,'issue':'images lacking alt attribute'})
    for field in ['title','description','mainTextSha256']:
        groups=collections.defaultdict(list)
        for p in pages: groups[str(p[field])].append(p['url'])
        for value, group in groups.items():
            if len(group)>1: findings.append({'issue':'duplicate '+field,'urls':group})
    # Reachability through raw server HTML links only, not client routing/sitemaps.
    by_path={(urllib.parse.urlparse(p['url']).path.rstrip('/') or '/'):p for p in pages}
    reached={'/'}; queue=['/']
    while queue:
        path=queue.pop()
        for link in by_path.get(path,{}).get('internalLinkPaths',[]):
            if link in by_path and link not in reached: reached.add(link);queue.append(link)
    orphans=sorted(set(by_path)-reached)
    if orphans: findings.append({'issue':'editorial pages not linked from homepage graph','paths':orphans})
    checks=[]
    for url in ['http://freeborndating.com/','https://www.freeborndating.com/','https://freeborn-umber.vercel.app/','https://freeborndating.com/seo-audit-deliberately-missing-page']:
        try:
            s,f,h,_=fetch(url);checks.append({'requested':url,'finalStatus':s,'finalUrl':f,'xRobotsTag':h.get('x-robots-tag')})
        except Exception as error: checks.append({'requested':url,'errorType':type(error).__name__})
    alias=inspect('https://freeborn-umber.vercel.app/')
    alternate_host={'url':alias['url'],'status':alias['status'],'canonical':alias['canonical']}
    comparisons=[]
    for path in ['/','/free-dating','/guides/shared-values-dating']:
        _,_,_,html=fetch(ORIGIN+path, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
        p=Page();p.feed(html);normal=by_path[path]
        text=' '.join(' '.join(p.main_text).split())
        comparisons.append({'path':path,'sameMainText':hashlib.sha256(text.encode()).hexdigest()==normal['mainTextSha256'],'sameTitle':p.title==normal['title'],'sameCanonical':p.canonicals==normal['canonical'],'scope':'Spoofed user agent comparison only, NOT a verified Googlebot request or Google rendering test.'})
    result={'measuredAt':datetime.now(timezone.utc).isoformat(),'scope':'Anonymous SSR editorial content only. No member data, indexing/ranking guarantee, Search Console access, Rich Results Test, field CWV or email/signup acceptance.',
            'sitemapUrls':len(urls),'auditedEditorialPages':len(pages),'skippedNonEditorialSitemapUrls':len(urls)-len(editorial),
            'alternateHostCanonical':alternate_host,'pages':pages,'homeGraphUnreachablePaths':orphans,'findings':findings,'redirectAnd404Checks':checks,'userAgentComparisons':comparisons}
    with open(args.output,'w') as f:json.dump(result,f,indent=2)
    print(json.dumps({'auditedEditorialPages':len(pages),'findings':findings,'homeGraphUnreachablePaths':orphans,'redirectAnd404Checks':checks,'userAgentComparisons':comparisons},indent=2))
if __name__=='__main__':main()
