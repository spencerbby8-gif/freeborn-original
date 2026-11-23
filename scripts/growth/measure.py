"""Offline-only search/completion import. Never connects to a console or installs tracking.
See docs/growth/MEASUREMENT-AND-RELEASE.md for formats, privacy and provenance limits.
"""
import argparse,csv,datetime,hashlib,html,json,re
from pathlib import Path
from urllib.parse import urlsplit
from fingerprint import ROOT
CANONICAL='https://freeborndating.com'

def editorial_paths():
    block=re.search(r'export const INDEXABLE_PATHS = \[([\s\S]*?)\];',(ROOT/'src/lib/site.ts').read_text()).group(1)
    return set(re.findall(r'path: "([^"]+)"',block))

def day(value):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value or ''):raise ValueError('Dates must use YYYY-MM-DD')
    return datetime.date.fromisoformat(value)

def count(value):
    if not re.fullmatch(r'\d+',str(value or '').strip()):raise ValueError('Counts must be nonnegative integers; no empty or estimated values')
    return int(str(value).strip())

def public_path(value):
    if not value:return None
    parsed=urlsplit(value)
    if parsed.query or parsed.fragment or parsed.username or parsed.password:raise ValueError('Page identifiers must not contain queries, fragments or credentials')
    if parsed.scheme or parsed.netloc:
        if parsed.scheme!='https' or parsed.netloc!='freeborndating.com':raise ValueError('Only canonical public pages are accepted')
    path=parsed.path or '/'
    if path not in editorial_paths():raise ValueError('Only approved public editorial paths can be imported')
    return path

def load_csv(path,allowed):
    if Path(path).stat().st_size>10_000_000:raise ValueError('Input exceeds 10 MB; use a bounded aggregate export')
    with Path(path).open(encoding='utf-8-sig',newline='') as file:
        reader=csv.DictReader(file)
        if not reader.fieldnames or len(set(reader.fieldnames))!=len(reader.fieldnames):raise ValueError('Missing or duplicate CSV headers')
        if set(reader.fieldnames)-allowed:raise ValueError('Unexpected CSV fields: reject input rather than import identifiers or personal data')
        rows=[]
        for row in reader:
            if len(rows)>=100_000 or None in row or any(value is None for value in row.values()):raise ValueError('Malformed or oversized CSV')
            rows.append(row)
    return rows,set(reader.fieldnames)

def import_search(path,engine,start,end):
    aliases={'Top queries':'query','Query':'query','Keyword':'query','Keywords':'query','Page':'page','Top pages':'page','URL':'page','Clicks':'clicks','Impressions':'impressions','Date':'date','Country':'country','Device':'device','CTR':'ctr','Position':'position','Average position':'position'}
    allowed=set(aliases)|{'query','page','clicks','impressions','date','country','device','ctr','position'}
    rows,headers=load_csv(path,allowed)
    normalized_headers=[aliases.get(key,key) for key in headers]
    if len(set(normalized_headers))!=len(normalized_headers):raise ValueError('Ambiguous duplicate dimension aliases')
    if not {'clicks','impressions'}<=set(normalized_headers):raise ValueError('Search input needs clicks and impressions')
    if not ({'query','page'}&set(normalized_headers)):raise ValueError('Search input needs a query or public-page dimension')
    groups={};seen=set();has_query='query' in normalized_headers
    for raw in rows:
        row={aliases.get(k,k):(v or '').strip() for k,v in raw.items()}
        date=row.get('date') or None
        if date and not start<=day(date)<=end:raise ValueError('Row date outside declared period')
        page=public_path(row.get('page'))
        query=row.get('query')
        if has_query and not query:raise ValueError('Missing query: unknown cannot be labeled nonbrand')
        key=(date,page,query,row.get('country'),row.get('device'))
        if key in seen:raise ValueError('Duplicate dimension rows could double-count an export')
        seen.add(key)
        clicks=count(row.get('clicks'));impressions=count(row.get('impressions'))
        if clicks>impressions:raise ValueError('Clicks cannot exceed impressions for the same exported row')
        classification='unknown'
        if has_query:
            normalized=re.sub(r'[^a-z0-9]','',query.lower())
            classification='branded' if 'freeborn' in normalized else 'nonbranded'
        group=groups.setdefault((page,classification),{'page':page,'queryClass':classification,'clicks':0,'impressions':0,'exportedRows':0})
        group['clicks']+=clicks;group['impressions']+=impressions;group['exportedRows']+=1
    aggregates=[]
    for value in groups.values():
        value['ctr']=value['clicks']/value['impressions'] if value['impressions'] else None
        aggregates.append(value)
    return {'engine':engine,'status':'imported_unverified','sourceSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'exportedRows':len(rows),'dimensions':sorted(set(normalized_headers)&{'query','page','date','country','device'}),'period':{'start':str(start),'end':str(end),'basis':'operator-declared; validated against row dates when supplied'},'aggregates':sorted(aggregates,key=lambda g:(g['page'] or '',g['queryClass'])),'limitations':['Locally supplied file; console ownership and provenance are not verified.','Sums cover exported rows, not necessarily property totals; anonymization, export limits and reporting lag may omit data.','No query-to-page join is inferred if one dimension is absent. CTR is recomputed, position is not fabricated.','Brand classification is a deterministic name/domain-variant heuristic, not semantic proof. Raw queries, country and device values are not copied to the output.']}

def import_completions(path,start,end):
    rows,headers=load_csv(path,{'date','event','channel','page','count'})
    if headers!={'date','event','channel','page','count'}:raise ValueError('Completion CSV requires exactly date,event,channel,page,count')
    groups={};seen=set()
    for row in rows:
        if not start<=day(row['date'])<=end:raise ValueError('Completion date outside declared period')
        if row['event']!='signup_completed':raise ValueError('Only server-confirmed signup_completed semantics accepted; clicks/starts are not completions')
        if row['channel'] not in {'organic_unknown','referral','direct','unknown'}:raise ValueError('Unsupported channel; do not infer branded search or attribution')
        page=public_path(row['page']);key=(row['date'],row['event'],row['channel'],page)
        if key in seen:raise ValueError('Duplicate completion aggregate rows')
        seen.add(key);group=groups.setdefault((row['channel'],page),{'channel':row['channel'],'page':page,'completedSignups':0});group['completedSignups']+=count(row['count'])
    return {'status':'imported_unverified','sourceSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'period':{'start':str(start),'end':str(end),'basis':'operator-declared; validated against row dates'},'aggregates':list(groups.values()),'limitations':['Aggregate semantics and source are supplied by the operator, not independently verified by this importer.','No individual identifiers, cross-device join, query attribution, conversion rate or causal connection to search clicks is established.']}

def make_report(gsc=None,bing=None,completions=None,start=None,end=None,synthetic=False):
    if bool(start)!=bool(end):raise ValueError('Start and end dates must be supplied together')
    if (gsc or bing or completions) and (not start or not end):raise ValueError('Explicit export period required for every import')
    start_day=day(start) if start else None;end_day=day(end) if end else None
    if start_day and start_day>end_day:raise ValueError('Start date must not follow end date')
    search=[]
    for engine,path in [('google',gsc),('bing',bing)]:
        search.append(import_search(path,engine,start_day,end_day) if path else {'engine':engine,'status':'unavailable','aggregates':None})
    return {'schemaVersion':1,'kind':'synthetic_demonstration' if synthetic else 'user_supplied_unverified' if any([gsc,bing,completions]) else 'no_data','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'networkCalls':0,'search':search,'completions':import_completions(completions,start_day,end_day) if completions else {'status':'unavailable','aggregates':None},'readyToClaimGrowth':False,'note':'No data means unknown, not zero. Import validates format; it does not authenticate exports, prove console ownership, collect events or establish causal growth.'}

def render(report):
    esc=html.escape;sections=''
    for source in report['search']:
        sections+='<h2>'+esc(source['engine'].title())+'</h2>'
        if source['aggregates'] is None:sections+='<p class="missing">Unavailable — no export supplied. Traffic is unknown, not zero.</p>';continue
        sections+='<p>Locally imported, unverified. Exported-row aggregates only.</p><table><tr><th>Public page</th><th>Query class</th><th>Clicks</th><th>Impressions</th></tr>'
        for g in source['aggregates']:sections+='<tr>'+''.join('<td>'+esc(str(v))+'</td>' for v in [g['page'] or 'Not provided',g['queryClass'],g['clicks'],g['impressions']])+'</tr>'
        sections+='</table>'
    sections+='<h2>Completed signups</h2><p>'+('Unavailable — no completion aggregate supplied.' if report['completions']['aggregates'] is None else 'Unverified supplied aggregates. No search conversion or causal attribution established.')+'</p>'
    if report['completions']['aggregates'] is not None:
        sections+='<table><tr><th>Channel</th><th>Public page</th><th>Completed signups (supplied)</th></tr>'
        for group in report['completions']['aggregates']:sections+='<tr>'+''.join('<td>'+esc(str(value))+'</td>' for value in [group['channel'],group['page'] or 'Unknown',group['completedSignups']])+'</tr>'
        sections+='</table>'
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Freeborn measurement review</title><style>body{font:16px/1.7 system-ui;background:#0c1420;color:#f4f1e9;max-width:1000px;margin:40px auto;padding:25px}h1{font-size:36px}.missing{color:#f2ce92}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:12px;border:1px solid #647187;text-align:left;overflow-wrap:anywhere}p{color:#c4cedc}</style><h1>Measurement, without invented results</h1><p>Data kind: '+esc(report['kind'])+'</p><p>'+esc(report['note'])+'</p>'+sections+'</html>'

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--gsc');parser.add_argument('--bing');parser.add_argument('--completions');parser.add_argument('--start');parser.add_argument('--end');parser.add_argument('--synthetic',action='store_true');parser.add_argument('--output',required=True);parser.add_argument('--html')
    args=parser.parse_args()
    try:
        outputs=[Path(value).resolve() for value in [args.output,args.html] if value]
        inputs=[Path(value).resolve() for value in [args.gsc,args.bing,args.completions] if value]
        if len(set(outputs))!=len(outputs) or any(value in inputs for value in outputs):raise ValueError('Report outputs must be distinct and must not overwrite input CSV files')
        for output in outputs:output.parent.mkdir(parents=True,exist_ok=True);output.unlink(missing_ok=True)
        report=make_report(args.gsc,args.bing,args.completions,args.start,args.end,args.synthetic)
        Path(args.output).write_text(json.dumps(report,indent=2)+'\n')
        if args.html:Path(args.html).write_text(render(report))
        print('Report written:',report['kind'],'— no network calls, no growth claim.')
    except (ValueError,OSError,KeyError) as error:parser.exit(2,str(error)+'\n')
