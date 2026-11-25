#!/usr/bin/env python3
"""Observe production editorial changes; --apply sends only changed hashes.
First run baselines without sending. State is durable, single-writer and private to CI.
No Bing Webmaster API credential is needed for IndexNow change notifications.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone

ORIGIN = 'https://freeborndating.com'
ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://api.indexnow.org/indexnow'

class SafeError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def request(url, payload=None):
    try:
        req = urllib.request.Request(url, data=payload, headers={
            'User-Agent': 'FreebornPublicChangeMonitor/1.0',
            **({'Content-Type': 'application/json; charset=utf-8'} if payload is not None else {})})
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
            data = r.read(8_000_001)
            if len(data) > 8_000_000:
                raise SafeError('Response exceeds size limit')
            return r.status, dict(r.headers), data.decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), ''
    except SafeError:
        raise
    except Exception:
        raise SafeError('Network request failed; address and credentials suppressed') from None

class EditorialHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.main = 0
        self.title_depth = 0
        self.skip = 0
        self.stack = []
        self.text, self.title, self.links = [], [], []
        self.description = self.canonical = ''
        self.directives = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            name = a.get('name', '').lower()
            if name == 'description': self.description = a.get('content', '')
            if name in ('robots', 'bingbot'): self.directives.append(a.get('content', ''))
        if tag == 'link' and 'canonical' in a.get('rel', '').lower().split():
            self.canonical = a.get('href', '')
        if tag in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'): return
        hidden = tag in ('script', 'style', 'noscript', 'template', 'nav', 'footer') or 'hidden' in a or a.get('aria-hidden') == 'true'
        self.stack.append((tag, hidden))
        if hidden: self.skip += 1
        if tag == 'main': self.main += 1
        if tag == 'title': self.title_depth += 1
        if tag == 'a' and self.main and not self.skip: self.links.append(a.get('href', ''))
    def handle_endtag(self, tag):
        if not any(t == tag for t, _ in self.stack): return
        while self.stack:
            t, hidden = self.stack.pop()
            if hidden: self.skip -= 1
            if t == 'main': self.main -= 1
            if t == 'title': self.title_depth -= 1
            if t == tag: break
    def handle_data(self, data):
        if self.title_depth and not self.skip: self.title.append(data)
        if self.main and not self.skip: self.text.append(data)

def fingerprint(url, body, headers):
    p = EditorialHTML(); p.feed(body)
    h = {k.lower(): v for k,v in headers.items()}
    if 'text/html' not in h.get('content-type', '').lower(): raise SafeError('Non-HTML public page')
    if re.search(r'\b(noindex|none)\b', ' '.join(p.directives + [h.get('x-robots-tag','')]), re.I):
        raise SafeError('Public page carries noindex/none')
    if p.canonical.rstrip('/') != url.rstrip('/'): raise SafeError('Canonical mismatch')
    visible = ' '.join(' '.join(p.text).split())
    title = ' '.join(' '.join(p.title).split())
    if len(visible) < 80 or not title: raise SafeError('Missing substantial server-rendered main content or title')
    meaningful = {'title':title, 'description':p.description, 'text':visible, 'links':sorted(set(p.links))}
    return hashlib.sha256(json.dumps(meaningful, sort_keys=True).encode()).hexdigest()

def inventory():
    source = (ROOT/'src/lib/site.ts').read_text()
    block = re.search(r'export const INDEXABLE_PATHS = \[([\s\S]*?)\];', source)
    if not block: raise SafeError('Public inventory missing')
    paths = re.findall(r'path: "([^"]+)"', block[1])
    if not paths or len(paths) != len(set(paths)): raise SafeError('Empty or duplicate inventory')
    for p in paths:
        if not re.fullmatch(r'/[a-z0-9/-]*', p) or '//' in p or re.match(r'^/(api|app|auth|onboarding|discover|profiles?)(/|$)',p):
            raise SafeError('Unsafe inventory path')
    return [ORIGIN+p for p in paths]

def collect(urls):
    status, _, robots = request(ORIGIN+'/robots.txt')
    if status != 200: raise SafeError('robots.txt unavailable')
    rp = urllib.robotparser.RobotFileParser(); rp.parse(robots.splitlines())
    status, _, sitemap = request(ORIGIN+'/sitemap.xml')
    if status != 200: raise SafeError('sitemap unavailable')
    from xml.etree import ElementTree as ET
    try: listed = {n.text.rstrip('/') for n in ET.fromstring(sitemap).iter() if n.tag.endswith('}loc') or n.tag == 'loc'}
    except Exception: raise SafeError('Invalid sitemap') from None
    hashes = {}
    for u in urls:
        if u.rstrip('/') not in listed: raise SafeError('Editorial URL absent from sitemap')
        if not rp.can_fetch('bingbot',u): raise SafeError('Bingbot disallowed')
        status, headers, body = request(u)
        if status != 200: raise SafeError('Public page not HTTP 200; no notifications sent')
        hashes[u] = fingerprint(u,body,headers)
    return hashes

def read_state(path):
    if not path.exists(): return None
    try:
        state = json.loads(path.read_text())
        if state.get('version') != 1 or not isinstance(state.get('hashes'),dict): raise ValueError()
        for url, digest in state['hashes'].items():
            if not url.startswith(ORIGIN+'/') or not re.fullmatch('[0-9a-f]{64}',digest): raise ValueError()
        return state
    except Exception: raise SafeError('Invalid state; refusing to silently re-baseline') from None

def save(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data,indent=2)+'\n');temp.replace(path)

def process(hashes, state_path, apply=False, baseline=False):
    allowed = set(inventory())
    if not hashes or any(u not in allowed or not re.fullmatch('[0-9a-f]{64}',h) for u,h in hashes.items()):
        raise SafeError('Only valid hashes for allowlisted public editorial URLs are accepted')
    state = read_state(state_path)
    if state and state.get('pending'): raise SafeError('Unreconciled submission attempt; manually inspect before any retry')
    if baseline:
        if state: raise SafeError('Baseline already exists; refusing overwrite')
        save(state_path,{'version':1,'hashes':hashes})
        return {'state':'baseline_created_no_submission','submitted':0,'pages':len(hashes)}
    if not state: raise SafeError('No baseline: run --baseline once after reviewing existing notifications')
    changed = [u for u,h in hashes.items() if state['hashes'].get(u) != h]
    removed = sorted(set(state['hashes']) - set(hashes))
    report = {'state':'dry_run','changed':changed,'removedRequireManualReview':removed,'submitted':0,
              'meaning':'Notification receipt is not crawl, index or ranking confirmation'}
    if not apply or not changed: return report
    if len(changed)>100: raise SafeError('Change safety cap exceeded')
    keys=list((ROOT/'public').glob('*.txt'))
    keys=[p for p in keys if re.fullmatch('[0-9a-f]{32}\\.txt',p.name)]
    if len(keys)!=1: raise SafeError('Expected exactly one public IndexNow key file')
    key=keys[0].stem
    if keys[0].read_text().strip()!=key: raise SafeError('Local IndexNow key mismatch')
    key_location=ORIGIN+'/'+keys[0].name
    status, _, live_key=request(key_location)
    if status!=200 or live_key.strip()!=key: raise SafeError('Live IndexNow key mismatch')
    payload=json.dumps({'host':'freeborndating.com','key':key,'keyLocation':key_location,'urlList':changed}).encode()
    state['pending']={'urls':changed,'hashes':{u:hashes[u] for u in changed},'startedAt':datetime.now(timezone.utc).isoformat()}
    save(state_path,state) # record BEFORE sending; interrupted/ambiguous attempts block retries
    status, _, _ = request(ENDPOINT,payload)
    report['httpStatus']=status
    if status in (200,202):
        state['hashes'].update({u:hashes[u] for u in changed});state.pop('pending')
        save(state_path,state)
        report.update(state='received' if status==200 else 'received_key_validation_pending',submitted=len(changed))
        return report
    if status in (400,403,422,429):
        state.pop('pending');save(state_path,state)
    raise SafeError('IndexNow rejected or ambiguous response HTTP '+str(status)+'; inspect state before retry')

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--state',default='.search-state/state.json');ap.add_argument('--report',default='search-notify-report.json')
    mode=ap.add_mutually_exclusive_group();mode.add_argument('--apply',action='store_true');mode.add_argument('--baseline',action='store_true')
    a=ap.parse_args();code=0
    try: report=process(collect(inventory()),Path(a.state),a.apply,a.baseline)
    except Exception as e:
        report={'state':'blocked','error':str(e) if isinstance(e,SafeError) else 'Unexpected error; details suppressed','submissionOutcome':'Not inferred from failure; inspect durable pending state and any receipt before retry'};code=1
    report['observedAt']=datetime.now(timezone.utc).isoformat()
    save(Path(a.report),report);print(json.dumps(report,indent=2));return code

if __name__=='__main__': raise SystemExit(main())
