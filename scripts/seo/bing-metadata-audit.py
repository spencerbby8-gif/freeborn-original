#!/usr/bin/env python3
"""Read-only, real HTTP metadata audit. Never claims Bing indexing or signs in.

Run against canonical production or an explicitly isolated loopback build:
 python3 scripts/seo/bing-metadata-audit.py --output=/path/to/evidence.json
 python3 scripts/seo/bing-metadata-audit.py --origin=http://127.0.0.1:3003 --output=/path/to/preview.json

Exit 1 means one of the explicit HTTP/metadata checks failed; it is not a
prediction of search-engine selection. The description range reproduces Bing's
25–160 character tool guidance, not a universal Google/Bing indexing prerequisite.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET

CANONICAL = 'https://freeborndating.com'
ALLOWED = {CANONICAL, 'http://127.0.0.1:3003', 'http://localhost:3003'}
SPEC = importlib.util.spec_from_file_location('deep_public_audit', Path(__file__).with_name('deep-public-audit.py'))
DEEP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEEP)
BING_UA = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'


def description_issues(values):
    if len(values) != 1:
        return ['expected exactly one meta description']
    text = values[0]
    problems = []
    if not text.strip():
        problems.append('empty description')
    if not 25 <= len(text) <= 160:
        problems.append('description outside Bing tool range 25–160')
    if text != text.strip():
        problems.append('description has edge whitespace')
    if any(t in text for t in ['\ufffd', 'Â·', '&amp;', '&quot;']):
        problems.append('possible encoding or double-escaping artifact')
    return problems


def canonical_path(url):
    return urllib.parse.urlparse(url).path.rstrip('/') or '/'


def check_page(origin, path, agent=DEEP.AGENT):
    url = origin + (path if path != '/' else '/')
    status, final, headers, body = DEEP.fetch(url, agent)
    parsed = DEEP.Page()
    parsed.feed(body)
    expected = (CANONICAL + path).rstrip('/')
    descriptions = parsed.metas.get('description', [])
    problems = description_issues(descriptions)
    if status != 200:
        problems.append('public page did not return HTTP 200')
    if len(parsed.canonicals) != 1 or parsed.canonicals[0].rstrip('/') != expected:
        problems.append('missing, duplicate or incorrect canonical')
    if not parsed.title or not parsed.main_text:
        problems.append('missing server-rendered title/main text')
    if len(parsed.headings) != 1:
        problems.append('expected one public H1 (editorial heuristic)')
    if not re.search(r'charset\s*=\s*["\']?utf-8', headers.get('content-type', ''), re.I):
        problems.append('HTML response not labelled UTF-8')
    if any(t in parsed.title for t in ['\ufffd', 'Â·', '&amp;']):
        problems.append('decoded title encoding artifact')
    directives = parsed.metas.get('robots', []) + parsed.metas.get('bingbot', [])
    if any('noindex' in v.lower() or 'none' == v.lower().strip() for v in directives + [headers.get('x-robots-tag', '')]):
        problems.append('public indexing restriction observed')
    json_errors = []
    types = []
    page_descriptions = []

    def collect_descriptions(value):
        if isinstance(value, dict):
            if value.get("@type") == "WebPage" and isinstance(value.get("description"), str):
                page_descriptions.append(value["description"])
            for child in value.values():
                collect_descriptions(child)
        elif isinstance(value, list):
            for child in value:
                collect_descriptions(child)

    for text in parsed.jsonld:
        try:
            value = json.loads(text)
            types += DEEP.flatten_types(value)
            collect_descriptions(value)
        except (ValueError, TypeError):
            json_errors.append('invalid JSON-LD')
    if json_errors:
        problems += json_errors
    if not parsed.metas.get('og:title') or not parsed.metas.get('og:image'):
        problems.append('missing OpenGraph title/image')
    return {
        'path': path, 'requestedUrl': url, 'finalUrl': final, 'httpStatus': status,
        'description': descriptions, 'descriptionCharacters': len(descriptions[0]) if len(descriptions) == 1 else None,
        'title': parsed.title, 'titleCharacters': len(parsed.title), 'canonical': parsed.canonicals,
        'robots': parsed.metas.get('robots', []), 'bingbot': parsed.metas.get('bingbot', []),
        'xRobotsTag': headers.get('x-robots-tag'), 'contentType': headers.get('content-type'),
        'mainWords': len(' '.join(parsed.main_text).split()), 'h1': parsed.headings,
        'ogTitle': parsed.metas.get('og:title', []), 'ogDescription': parsed.metas.get('og:description', []),
        'schemaTypes': sorted(set(types)), 'jsonLdBlocks': len(parsed.jsonld),
        'webPageDescriptions': page_descriptions,
        'internalPaths': sorted(set(canonical_path(urllib.parse.urljoin(url, link)) for link in parsed.links
                                    if urllib.parse.urlparse(urllib.parse.urljoin(url, link)).netloc in
                                    {urllib.parse.urlparse(origin).netloc, 'freeborndating.com'})),
        'issues': problems,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--origin', default=CANONICAL)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    origin = args.origin.rstrip('/')
    if origin not in ALLOWED:
        raise ValueError('Only canonical public production or explicit isolated loopback build allowed')
    root = Path(__file__).resolve().parents[2]
    site = (root / 'src/lib/site.ts').read_text()
    block = re.search(r'export const INDEXABLE_PATHS = \[([\s\S]*?)\];', site).group(1)
    paths = re.findall(r'path: "([^"]+)"', block)
    if not paths or len(paths) != len(set(paths)):
        raise ValueError('Invalid editorial inventory')
    status, _, _, xml = DEEP.fetch(origin + '/sitemap.xml')
    if status != 200:
        raise ValueError('Sitemap unavailable')
    sitemap = [el.text for el in ET.fromstring(xml).iter() if el.tag.endswith('}loc')]
    listed = {canonical_path(u) for u in sitemap if urllib.parse.urlparse(u).netloc == 'freeborndating.com'}
    _, _, _, robots = DEEP.fetch(origin + '/robots.txt')
    rules = urllib.robotparser.RobotFileParser()
    rules.parse(robots.splitlines())
    with ThreadPoolExecutor(max_workers=3) as pool:
        pages = list(pool.map(lambda path: check_page(origin, path), paths))
    issues = []
    repaired_source = (root / 'src/lib/editorial-descriptions.ts').read_text()
    repaired_paths = set(re.findall(r"^  '([^']+)':", repaired_source, re.M))
    for page in pages:
        if page['path'] in repaired_paths:
            if page['ogDescription'] != page['description']:
                issues.append({'path': page['path'], 'issue': 'OpenGraph/meta description mismatch'})
            if page['webPageDescriptions'] != page['description']:
                issues.append({'path': page['path'], 'issue': 'WebPage/meta description mismatch'})
        for issue in page['issues']:
            issues.append({'path': page['path'], 'issue': issue})
        if page['path'] not in listed:
            issues.append({'path': page['path'], 'issue': 'missing from sitemap'})
        if not rules.can_fetch('Bingbot', CANONICAL + page['path']):
            issues.append({'path': page['path'], 'issue': 'robots.txt blocks public Bingbot path'})
    for key in ['title', 'description']:
        seen = {}
        for page in pages:
            value = str(page[key])
            if value in seen:
                issues.append({'paths': [seen[value], page['path']], 'issue': 'exact duplicate ' + key})
            seen[value] = page['path']
    by_path = {p['path']: p for p in pages}
    reached = {'/'}
    queue = ['/']
    while queue:
        for path in by_path[queue.pop()]['internalPaths']:
            if path in by_path and path not in reached:
                reached.add(path)
                queue.append(path)
    for path in set(paths) - reached:
        issues.append({'path': path, 'issue': 'not reachable in homepage HTML link graph'})
    bot_checks = [check_page(origin, p, BING_UA) for p in ['/', '/free-dating', '/guides/shared-values-dating']]
    for page in bot_checks:
        for issue in page['issues']:
            # Description issues are already recorded from the normal response.
            if 'description' not in issue:
                issues.append({'path': page['path'], 'issue': 'simulated Bingbot: ' + issue})
        if page['description'] != by_path[page['path']]['description'] or page['title'] != by_path[page['path']]['title']:
            issues.append({'path': page['path'], 'issue': 'simulated Bingbot metadata differs'})
    private_checks = []
    for path in ['/auth', '/app']:
        s, _, h, body = DEEP.fetch(origin + path)
        p = DEEP.Page()
        p.feed(body)
        noindex = any('noindex' in value.lower() for value in p.metas.get('robots', []) + [h.get('x-robots-tag', '')])
        private_checks.append({'path': path, 'status': s, 'noindexObserved': noindex})
        if not noindex:
            issues.append({'path': path, 'issue': 'private shell lost noindex'})
    anonymous_api_checks = []
    for path in ['/api/profiles', '/api/notifications']:
        s, _, _, _ = DEEP.fetch(origin + path)
        anonymous_api_checks.append({'path': path, 'httpStatus': s, 'expectedStatus': 401})
        if s != 401:
            issues.append({'path': path, 'issue': 'member endpoint did not reject anonymous request with 401'})
    result = {
        'measuredAt': datetime.now(timezone.utc).isoformat(), 'origin': origin,
        'scope': 'Real anonymous HTTP responses. Bingbot user agent is simulated, not a verified crawler. Does not access webmaster accounts or certify Bing rendering, quality selection, indexing, rankings or production deployment of local code.',
        'descriptionRule': '25–160 decoded Unicode characters, from supplied Bing tool screenshot; presentation lint, not an indexing guarantee.',
        'editorialPages': len(pages), 'pages': pages, 'simulatedBingbotChecks': bot_checks,
        'privateNoindexChecks': private_checks, 'anonymousMemberApiChecks': anonymous_api_checks,
        'issues': issues, 'ok': not issues,
    }
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'origin': origin, 'editorialPages': len(pages), 'issues': issues, 'ok': not issues}, indent=2))
    raise SystemExit(0 if result['ok'] else 1)


if __name__ == '__main__':
    main()
