#!/usr/bin/env python3
"""Read-only Bing diagnostics. Key only from BING_WEBMASTER_API_KEY environment.
No automatic URL submissions, crawl-setting changes, sitemap changes or fetch requests.
"""
import json
import os
from pathlib import Path
import urllib.request
from urllib.parse import urlencode
from datetime import datetime, timezone

METHODS = ['GetFeeds','GetCrawlStats','GetCrawlIssues','GetBlockedUrls','GetUrlSubmissionQuota','GetRankAndTrafficStats']
BASE='https://ssl.bing.com/webmaster/api.svc/json/'
SITE='https://freeborndating.com/'

def audit(key, transport=None):
    def default_transport(method):
        req=urllib.request.Request(BASE+method+'?'+urlencode({'siteUrl':SITE,'apikey':key}))
        with urllib.request.urlopen(req,timeout=30) as r: return json.load(r)
    get=transport or default_transport
    rows=[];warnings=[];failed=False
    for method in METHODS:
        try:
            body=get(method)
            if not isinstance(body,dict) or 'd' not in body: raise ValueError()
            # These read-only methods contain no account credentials; redact key if an upstream echoes it.
            body=json.loads(json.dumps(body).replace(key,'[REDACTED]'))
            rows.append({'method':method,'ok':True,'body':body})
            d=body['d']
            if method=='GetFeeds' and (not isinstance(d,list) or not any(x.get('Url')==SITE+'sitemap.xml' and x.get('Status')=='Success' for x in d)):
                warnings.append('Canonical sitemap success not confirmed')
            if method=='GetCrawlStats':
                if not d: warnings.append('No crawl statistics returned')
                elif d[-1].get('InIndex',0)==0: warnings.append('Last returned crawl-stat row reports InIndex=0; inspect current Bing UI; this API can lag')
            if method in ('GetBlockedUrls','GetCrawlIssues') and d: warnings.append(method+' returned entries; review report')
        except Exception:
            rows.append({'method':method,'ok':False,'error':'API request failed or invalid schema; credentials and request URL suppressed'})
            failed=True
    return {'observedAt':datetime.now(timezone.utc).isoformat(),'site':SITE,'readOnly':True,
            'results':rows,'warnings':warnings,'apiErrors':failed,
            'meaning':'API observations, not a guarantee of current complete index coverage or rankings'}

def main():
    key=os.environ.get('BING_WEBMASTER_API_KEY','').strip()
    if not key:
        print('BING_WEBMASTER_API_KEY missing; no requests sent');return 1
    report=audit(key)
    Path('bing-monitor-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'report':'bing-monitor-report.json','warnings':report['warnings'],'apiErrors':report['apiErrors']},indent=2))
    return 1 if report['apiErrors'] or report['warnings'] else 0
if __name__=='__main__': raise SystemExit(main())
