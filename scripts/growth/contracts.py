"""Synthetic local contracts; no traffic, signups or approvals asserted as real."""
import argparse,copy,csv,datetime,importlib.util,json,subprocess,sys,tempfile
from pathlib import Path
from fingerprint import fingerprint
from measure import make_report,render,public_path
spec=importlib.util.spec_from_file_location('release_review',Path(__file__).with_name('release-review.py'));release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
checks=[]
def check(name,fn):fn();checks.append(name);print('ok',len(checks),'-',name)
def equal(a,b):assert a==b,(a,b)
def rejects(fn):
    try:fn()
    except (ValueError,TypeError,KeyError):return
    raise AssertionError('Expected rejection')

def run(output):
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        def csvfile(name,header,rows):
            p=root/name
            with p.open('w',newline='') as f:
                writer=csv.writer(f);writer.writerow(header);writer.writerows(rows)
            return str(p)
        native=csvfile('synthetic-google.csv',['Top queries','Clicks','Impressions','CTR','Position'],[['free born dating',3,30,'10%',4],['conversation topics',1,20,'5%',9]])
        bing=csvfile('synthetic-bing.csv',['Keyword','Clicks','Impressions','CTR','Average position'],[['freeborndating.com',1,10,'10%',2]])
        completions=csvfile('synthetic-completions.csv',['date','event','channel','page','count'],[['2026-11-20','signup_completed','unknown','/free-dating',1]])
        opts={'start':'2026-11-19','end':'2026-11-21','synthetic':True}
        check('missing baseline is unknown, not a fabricated zero',lambda:equal(make_report()['search'][0]['aggregates'],None))
        check('no-data report never asserts growth',lambda:equal(make_report()['readyToClaimGrowth'],False))
        check('HTML explicitly identifies missing exports',lambda:equal('unknown, not zero' in render(make_report()),True))
        report=make_report(native,bing,completions,**opts)
        check('completion report displays supplied counts without asserting conversion',lambda:equal('Completed signups (supplied)' in render(report) and 'No search conversion or causal attribution established' in render(report),True))
        check('synthetic mode stays prominently synthetic',lambda:equal(report['kind'],'synthetic_demonstration'))
        google=report['search'][0]['aggregates']
        check('space-separated brand variant classified branded',lambda:equal(next(g['clicks'] for g in google if g['queryClass']=='branded'),3))
        check('nonbrand aggregate separate from brand',lambda:equal(next(g['clicks'] for g in google if g['queryClass']=='nonbranded'),1))
        check('query-only export cannot invent page attribution',lambda:equal(all(g['page'] is None for g in google),True))
        check('raw queries absent from output',lambda:equal('conversation topics' in json.dumps(report),False))
        check('source is marked unverified, never console-authenticated',lambda:equal(report['search'][0]['status'],'imported_unverified'))
        check('no network collection performed',lambda:equal(report['networkCalls'],0))
        check('completion report does not create a conversion rate',lambda:equal('conversionRate' in report['completions'],False))
        check('imports require an explicit period',lambda:rejects(lambda:make_report(gsc=native)))
        check('start-only period is rejected even without inputs',lambda:rejects(lambda:make_report(start='2026-11-19')))
        check('end-only period is rejected even without inputs',lambda:rejects(lambda:make_report(end='2026-11-21')))
        short=csvfile('short-row.csv',['query','clicks','impressions'],[['x',1]])
        check('CSV missing trailing fields is rejected',lambda:rejects(lambda:make_report(gsc=short,**opts)))
        check('reversed dates rejected',lambda:rejects(lambda:make_report(gsc=native,start='2026-11-21',end='2026-11-19')))
        check('invalid date rejected',lambda:rejects(lambda:make_report(gsc=native,start='2026-02-30',end='2026-11-21')))
        for page in ['/app','/auth','/discover','/api/profiles','/guides/not-real','https://evil.example/free-dating','//evil.example/free-dating','/free-dating?email=private','/free-dating#private','https://freeborndating.com:443/free-dating']:
            check('reject noneditorial/sensitive page '+page,lambda page=page:rejects(lambda:public_path(page)))
        check('canonical public URL accepted',lambda:equal(public_path('https://freeborndating.com/free-dating'),'/free-dating'))
        def bad_search(header,rows):return lambda:make_report(gsc=csvfile('bad.csv',header,rows),**opts)
        check('PII-bearing additional columns rejected',lambda:rejects(bad_search(['query','clicks','impressions','email'],[['x',1,2,'person@example.test']])))
        check('negative counts rejected',lambda:rejects(bad_search(['query','clicks','impressions'],[['x',-1,2]])))
        check('missing counts not coerced to zero',lambda:rejects(bad_search(['query','clicks','impressions'],[['x','',2]])))
        check('impossible click/impression counts rejected',lambda:rejects(bad_search(['query','clicks','impressions'],[['x',4,2]])))
        check('duplicate aggregate dimensions rejected',lambda:rejects(bad_search(['query','clicks','impressions'],[['x',1,2],['x',1,2]])))
        check('ambiguous dimension aliases rejected',lambda:rejects(bad_search(['Query','query','clicks','impressions'],[['x','x',1,2]])))
        check('missing query does not become nonbrand',lambda:rejects(bad_search(['query','clicks','impressions'],[['',0,2]])))
        check('out-of-period rows rejected',lambda:rejects(bad_search(['date','query','clicks','impressions'],[['2026-10-01','x',1,2]])))
        pagefile=csvfile('pages.csv',['Page','Clicks','Impressions'],[['https://freeborndating.com/free-dating',1,20]])
        check('page-only export keeps query class unknown',lambda:equal(make_report(gsc=pagefile,**opts)['search'][0]['aggregates'][0]['queryClass'],'unknown'))
        invalid=csvfile('invalid-completions.csv',['date','event','channel','page','count'],[['2026-11-20','signup_started','unknown','/free-dating',2]])
        check('signup-start clicks cannot count as completions',lambda:rejects(lambda:make_report(completions=invalid,**opts)))
        invalid=csvfile('invalid-completions.csv',['date','event','channel','page','count'],[['2026-11-20','signup_completed','nonbranded','/free-dating',2]])
        check('unknown organic source cannot be asserted nonbrand signup',lambda:rejects(lambda:make_report(completions=invalid,**opts)))
        snapshot=fingerprint();passing={'ok':True,'checks':1,'failures':[],'sourceFingerprint':snapshot}
        ready=lambda **kw:release.readiness(quality=kw.get('quality',passing),browser=passing,contracts=passing,measurement=kw.get('measurement',report),approval=kw.get('approval'),paths=kw.get('paths',()))
        check('default release state is blocked',lambda:equal(release.readiness()['state'],'blocked'))
        check('synthetic metrics cannot clear a release gate',lambda:equal(any('baseline' in x for x in ready()['blocks']),True))
        check('source fingerprint mismatch blocks readiness',lambda:equal(any('stale' in x for x in ready(quality={**passing,'sourceFingerprint':'old'})['blocks']),True))
        check('failed evidence blocks readiness',lambda:equal(any('passing' in x for x in ready(quality={**passing,'ok':False})['blocks']),True))
        check('private submission plan rejected',lambda:equal(any('private paths' in x for x in ready(paths=['/api/profiles'])['blocks']),True))
        check('release reviewer never deploys or submits',lambda:equal((ready()['released'],ready()['networkCalls'],ready()['notificationPlan']['sent']),(False,0,False)))
        check('no-data measurements cannot clear release gate',lambda:equal(any('baseline' in x for x in ready(measurement=make_report())['blocks']),True))
        approval={'releaseApproved':True,'sourceFingerprint':snapshot,'reviewer':'SYNTHETIC TEST ONLY','approvedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'gates':{k:{'attested':True,'evidenceRef':'synthetic reference, not real evidence'} for k in ['providerLegalReviewed','physicalDevicesValidated','productionFlowsValidated','measurementPrivacyReviewed','consoleOwnershipAndExportsReviewed']}}
        supplied={**report,'kind':'user_supplied_unverified'}
        check('complete synthetic inputs exercise manual-review branch only',lambda:equal(ready(measurement=supplied,approval=approval)['state'],'ready_for_manual_release_review'))
        check('even manual-ready state never asserts independent attestation',lambda:equal(ready(measurement=supplied,approval=approval)['operatorAttestationsIndependentlyVerified'],False))
        check('stale approval blocks readiness',lambda:equal(any('approval date' in x for x in ready(measurement=supplied,approval={**approval,'approvedAt':'2020-01-01T00:00:00Z'})['blocks']),True))
        check('false external gate cannot clear readiness',lambda:equal(any('External gate' in x for x in ready(measurement=supplied,approval={**approval,'gates':{}})['blocks']),True))
        check('imported data never becomes an automatic growth claim',lambda:equal(supplied['readyToClaimGrowth'],False))
        def changed_report(change):
            value=copy.deepcopy(supplied);change(value);return ready(measurement=value,approval=approval)
        def is_blocked(value):equal(value['state'],'blocked')
        check('two Google exports cannot substitute for Google and Bing',lambda:is_blocked(changed_report(lambda v:v['search'][1].update(engine='google'))))
        check('mismatched completion period blocks readiness',lambda:is_blocked(changed_report(lambda v:v['completions']['period'].update(start='2026-11-20'))))
        check('mismatched Bing period blocks readiness',lambda:is_blocked(changed_report(lambda v:v['search'][1]['period'].update(end='2026-11-20'))))
        check('invalid period blocks readiness',lambda:is_blocked(changed_report(lambda v:v['search'][0].update(period=None))))
        check('missing source identity blocks readiness',lambda:is_blocked(changed_report(lambda v:v['search'][0].pop('sourceSha256'))))
        check('invalid search container fails closed',lambda:is_blocked(changed_report(lambda v:v.update(search=None))))
        check('invalid completion container fails closed',lambda:is_blocked(changed_report(lambda v:v.update(completions=None))))
        check('invalid gates container fails closed',lambda:is_blocked(ready(measurement=supplied,approval={**approval,'gates':None})))
        check('invalid approval date type fails closed',lambda:is_blocked(ready(measurement=supplied,approval={**approval,'approvedAt':True})))
        check('boolean assertion count does not qualify as evidence',lambda:is_blocked(ready(quality={**passing,'checks':True},measurement=supplied,approval=approval)))
        stale=root/'readiness.json';stale.write_text('{"state":"ready_for_manual_release_review"}')
        broken=root/'broken.json';broken.write_text('{broken')
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('release-review.py')),'--quality='+str(broken),'--output='+str(stale)],capture_output=True)
        check('invalid CLI input clears stale readiness instead of leaving an old pass',lambda:equal((result.returncode,stale.exists()),(2,False)))
        contents=broken.read_bytes()
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('release-review.py')),'--quality='+str(broken),'--output='+str(broken)],capture_output=True)
        check('release output cannot overwrite input evidence',lambda:equal((result.returncode,broken.read_bytes()),(2,contents)))
        contents=Path(native).read_bytes()
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('measure.py')),'--gsc='+native,'--start=2026-11-19','--end=2026-11-21','--output='+native],capture_output=True)
        check('measurement output cannot overwrite its source CSV',lambda:equal((result.returncode,Path(native).read_bytes()),(2,contents)))
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('measure.py')),'--output='+str(stale),'--html='+str(stale)],capture_output=True)
        check('measurement HTML cannot overwrite its JSON report',lambda:equal(result.returncode,2))
        stale.write_text('{"kind":"user_supplied_unverified"}')
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('measure.py')),'--start=2026-11-19','--output='+str(stale)],capture_output=True)
        check('invalid import clears stale measurement output',lambda:equal((result.returncode,stale.exists()),(2,False)))
    result={'ok':True,'checks':len(checks),'failures':[],'sourceFingerprint':fingerprint(),'results':checks,'scope':'Synthetic local transformation/readiness contracts, no real traffic, signups, approvals or production operations.'}
    p=Path(output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,indent=2)+'\n');print('PASS',len(checks),'growth contracts')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);args=p.parse_args();run(args.output)
