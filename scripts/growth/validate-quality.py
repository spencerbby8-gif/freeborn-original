"""Run fixed local quality commands, recording exits and source identity. No external services."""
import argparse,datetime,json,os,subprocess
from pathlib import Path
from fingerprint import ROOT,fingerprint

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output-dir',required=True);args=parser.parse_args()
    out=Path(args.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
    initial=fingerprint();env=os.environ.copy();env['NODE_OPTIONS']='--max-old-space-size=768'
    steps=[('lint',['npm','run','lint']),('typecheck',['npm','run','typecheck']),('build',['npm','run','build']),('harness',['npm','run','test:harness']),('discovery-privacy',['npm','run','test:discovery-privacy']),('values-contracts',['node','scripts/seo/values-conversation-contracts.mjs']),('free-dating-contracts',['node','scripts/seo/free-dating-contracts.mjs']),('submission-contracts',['node','scripts/seo/submission-contracts.mjs']),('secrets',['npm','run','check:secrets']),('diff',['git','diff','--check'])]
    results=[];failures=[]
    for name,command in steps:
        print('Checking',name,flush=True)
        try:
            result=subprocess.run(command,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
            (out/(name+'.log')).write_bytes(result.stdout);code=result.returncode
        except subprocess.TimeoutExpired as error:
            (out/(name+'.log')).write_bytes((error.stdout or b'')+b'\nTIMEOUT: incomplete check\n');code=124
        results.append({'name':name,'command':command,'exitCode':code})
        if code!=0:failures.append(name+': failed or incomplete')
    if fingerprint()!=initial:failures.append('Source changed during quality validation')
    report={'ok':not failures,'checks':len(results),'failures':failures,'sourceFingerprint':initial,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':results,'scope':'Fixed local command exit results, not a hosted CI or production certification.'}
    (out/'quality.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS' if not failures else failures)
    return 0 if not failures else 1
if __name__=='__main__':raise SystemExit(main())
