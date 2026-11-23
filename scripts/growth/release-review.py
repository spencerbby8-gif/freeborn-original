"""Read-only release readiness. Never deploys, creates a PR, submits URLs or contacts a provider.
Exit 2 = missing/failed/stale evidence, 0 = ready for MANUAL review, never released.
"""
import argparse,datetime,json,re
from pathlib import Path
from fingerprint import fingerprint
from measure import editorial_paths,day

def load(path):
    if not path:return None
    return json.loads(Path(path).read_text())

def readiness(quality=None,browser=None,contracts=None,measurement=None,approval=None,paths=()):
    current=fingerprint();blocks=[];evidence={}
    for label,report in [('quality',quality),('editorialBrowser',browser),('growthContracts',contracts)]:
        if not isinstance(report,dict):blocks.append(label+': missing');continue
        if report.get('sourceFingerprint')!=current:blocks.append(label+': stale or unbound source fingerprint')
        if report.get('ok') is not True or type(report.get('checks')) is not int or report['checks']<1 or report.get('failures')!=[]:blocks.append(label+': no complete passing result')
        evidence[label]={'checks':report.get('checks'),'ok':report.get('ok'),'sourceFingerprint':report.get('sourceFingerprint')}
    if not isinstance(measurement,dict) or measurement.get('kind')!='user_supplied_unverified':
        blocks.append('Measurement baseline: real owner-supplied exports/aggregate data not available (synthetic and no-data reports are not evidence)')
    else:
        search=measurement.get('search');completion=measurement.get('completions')
        valid_search=isinstance(search,list) and len(search)==2 and all(isinstance(item,dict) for item in search)
        if not valid_search or sorted(str(item.get('engine')) for item in search)!=['bing','google'] or any(item.get('status')!='imported_unverified' for item in search):blocks.append('Measurement baseline: exactly one Google and one Bing export required for this review scope')
        if not isinstance(completion,dict) or completion.get('status')!='imported_unverified':blocks.append('Measurement baseline: completed-signup aggregates unavailable')
        sources=(search if valid_search else [])+([completion] if isinstance(completion,dict) else [])
        periods=[]
        for source in sources:
            try:
                period=source['period'];start=day(period['start']);end=day(period['end'])
                if start>end:raise ValueError('Reversed period')
                periods.append((str(start),str(end)))
            except (KeyError,TypeError,ValueError):blocks.append('Measurement baseline: invalid or missing source period')
            if not isinstance(source.get('aggregates'),list) or not re.fullmatch(r'[a-f0-9]{64}',str(source.get('sourceSha256',''))):blocks.append('Measurement baseline: missing aggregate/source identity')
        if len(periods)!=3 or len(set(periods))!=1:blocks.append('Measurement baseline: Google, Bing and completion periods must match')
        if measurement.get('readyToClaimGrowth') is not False:blocks.append('Measurement report has unsupported growth-claim semantics')
    gates=['providerLegalReviewed','physicalDevicesValidated','productionFlowsValidated','measurementPrivacyReviewed','consoleOwnershipAndExportsReviewed']
    if not isinstance(approval,dict):blocks.append('Owner approval and external evidence: missing')
    else:
        if approval.get('releaseApproved') is not True:blocks.append('Owner has not approved release')
        if approval.get('sourceFingerprint')!=current:blocks.append('Owner approval is not bound to current source')
        if not isinstance(approval.get('reviewer'),str) or not approval['reviewer'].strip():blocks.append('Owner reviewer is missing')
        try:
            if not isinstance(approval.get('approvedAt'),str):raise ValueError('Invalid approval date')
            date=datetime.datetime.fromisoformat(approval['approvedAt'].replace('Z','+00:00'))
            age=(datetime.datetime.now(datetime.timezone.utc)-date).total_seconds()
            if not date.tzinfo or not -300<=age<=7*86400:raise ValueError('Approval not current')
        except (KeyError,TypeError,ValueError):blocks.append('Owner approval date missing/invalid/stale')
        gate_items=approval.get('gates') if isinstance(approval.get('gates'),dict) else {}
        for gate in gates:
            item=gate_items.get(gate)
            if not isinstance(item,dict) or item.get('attested') is not True or not isinstance(item.get('evidenceRef'),str) or not item['evidenceRef'].strip():blocks.append('External gate not evidenced: '+gate)
    approved=editorial_paths()
    if any(path not in approved for path in paths):blocks.append('Notification selection includes non-editorial or private paths')
    selected=sorted(set(path for path in paths if path in approved))
    return {'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceFingerprint':current,'state':'blocked' if blocks else 'ready_for_manual_release_review','released':False,'networkCalls':0,'blocks':blocks,'localEvidence':evidence,'operatorAttestationsIndependentlyVerified':False,'inspectionUrls':['https://freeborndating.com'+(p if p!='/' else '/') for p in sorted(approved)],'notificationPlan':{'paths':selected,'sent':False,'meaning':'Candidate changed public URLs only; must be checked against actual approved release before sending. Receipt is not indexing/ranking evidence. Google is not an IndexNow participant.'},'limits':['This is artifact/readiness validation, not deployment, CI identity verification, a signature or legal/provider certification.','Operator attestations and imported exports require human review; content can be fabricated outside this tool.','No permission to publish, send notifications, post outreach or mutate production is created by this report.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['quality','browser','contracts','measurement','approval']:parser.add_argument('--'+name)
    parser.add_argument('--path',action='append',default=[]);parser.add_argument('--output',required=True);args=parser.parse_args()
    try:
        out=Path(args.output)
        inputs=[Path(getattr(args,name)).resolve() for name in ['quality','browser','contracts','measurement','approval'] if getattr(args,name)]
        if out.resolve() in inputs:raise ValueError('Output must not overwrite an input evidence file')
        out.parent.mkdir(parents=True,exist_ok=True);out.unlink(missing_ok=True)
        report=readiness(**{name:load(getattr(args,name)) for name in ['quality','browser','contracts','measurement','approval']},paths=args.path)
        out.write_text(json.dumps(report,indent=2)+'\n');print(report['state']);print('\n'.join(report['blocks']));raise SystemExit(2 if report['blocks'] else 0)
    except (ValueError,OSError,TypeError) as error:parser.exit(2,str(error)+'\n')
