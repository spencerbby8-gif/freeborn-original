import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

D=Path(__file__).parent

def load(name,file):
    spec=importlib.util.spec_from_file_location(name,D/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
n=load('notify','search-notify.py');b=load('monitor','bing-monitor.py')
U=n.ORIGIN+'/'
HEAD={'Content-Type':'text/html; charset=utf-8'}
BODY='<html><head><title>Freeborn</title><meta name="description" content="Real guide"><link rel="canonical" href="'+U+'"></head><body><main><h1>Useful original content</h1><p>'+('Helpful advice for people. '*10)+'</p><a href="/guides">Guides</a></main><script>nonce=random</script></body></html>'

class Tests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.s=Path(self.t.name)/'state.json';self.h={U:n.fingerprint(U,BODY,HEAD)}
    def tearDown(self):self.t.cleanup()
    def test_inventory_public(self):self.assertEqual(len(n.inventory()),16)
    def test_baseline_no_network(self):
        with patch.object(n,'request',side_effect=AssertionError('unexpected network')):
            self.assertEqual(n.process(self.h,self.s,baseline=True)['submitted'],0)
    def test_missing_baseline_blocks(self):
        with self.assertRaises(n.SafeError):n.process(self.h,self.s,apply=True)
    def test_baseline_overwrite_blocks(self):
        n.process(self.h,self.s,baseline=True)
        with self.assertRaises(n.SafeError):n.process(self.h,self.s,baseline=True)
    def test_unchanged_no_post(self):
        n.process(self.h,self.s,baseline=True)
        with patch.object(n,'request',side_effect=AssertionError('unexpected network')):
            self.assertEqual(n.process(self.h,self.s,apply=True)['submitted'],0)
    def test_dry_run_never_sends(self):
        n.process(self.h,self.s,baseline=True)
        with patch.object(n,'request',side_effect=AssertionError('unexpected network')):
            self.assertEqual(n.process({U:'a'*64},self.s)['changed'],[U])
    def test_script_nonce_ignored(self):self.assertEqual(self.h[U],n.fingerprint(U,BODY.replace('nonce=random','nonce=other'),HEAD))
    def test_css_class_ignored(self):self.assertEqual(self.h[U],n.fingerprint(U,BODY.replace('<main>','<main class="changed">'),HEAD))
    def test_text_change_detected(self):self.assertNotEqual(self.h[U],n.fingerprint(U,BODY.replace('Useful original','Better original'),HEAD))
    def test_description_detected(self):self.assertNotEqual(self.h[U],n.fingerprint(U,BODY.replace('Real guide','Updated guide'),HEAD))
    def test_noindex_blocks(self):
        with self.assertRaises(n.SafeError):n.fingerprint(U,BODY, {**HEAD,'X-Robots-Tag':'bingbot: noindex'})
    def test_bing_meta_blocks(self):
        with self.assertRaises(n.SafeError):n.fingerprint(U,BODY.replace('</head>','<meta name="bingbot" content="none"></head>'),HEAD)
    def test_wrong_canonical_blocks(self):
        with self.assertRaises(n.SafeError):n.fingerprint(U,BODY.replace('href="'+U+'"','href="https://wrong.example/"'),HEAD)
    def test_no_main_blocks(self):
        with self.assertRaises(n.SafeError):n.fingerprint(U,BODY.replace('main>','div>'),HEAD)
    def test_nonhtml_blocks(self):
        with self.assertRaises(n.SafeError):n.fingerprint(U,BODY,{'Content-Type':'text/plain'})
    def test_corrupt_state_blocks(self):
        self.s.write_text('invalid')
        with self.assertRaises(n.SafeError):n.read_state(self.s)
    def test_pending_blocks(self):
        n.save(self.s,{'version':1,'hashes':self.h,'pending':{'urls':[U]}})
        with self.assertRaises(n.SafeError):n.process(self.h,self.s,apply=True)
    def test_receipt_and_no_repeat(self):
        n.process(self.h,self.s,baseline=True);changed={U:'a'*64}
        key=next((n.ROOT/'public').glob('[0-9a-f]'*32+'.txt')).stem
        calls=[]
        def transport(url,payload=None):
            calls.append((url,payload));return (200,{},key) if payload is None else (200,{},'')
        with patch.object(n,'request',side_effect=transport):
            self.assertEqual(n.process(changed,self.s,apply=True)['submitted'],1)
            self.assertEqual(n.process(changed,self.s,apply=True)['submitted'],0)
        self.assertEqual(sum(p is not None for _,p in calls),1)
    def test_timeout_preserves_pending(self):
        n.process(self.h,self.s,baseline=True)
        key=next((n.ROOT/'public').glob('[0-9a-f]'*32+'.txt')).stem
        with patch.object(n,'request',side_effect=[(200,{},key),n.SafeError('timeout')]):
            with self.assertRaises(n.SafeError):n.process({U:'b'*64},self.s,apply=True)
        self.assertIn('pending',n.read_state(self.s))
    def test_429_does_not_advance_hash(self):
        n.process(self.h,self.s,baseline=True)
        key=next((n.ROOT/'public').glob('[0-9a-f]'*32+'.txt')).stem
        with patch.object(n,'request',side_effect=[(200,{},key),(429,{},'')]):
            with self.assertRaises(n.SafeError):n.process({U:'b'*64},self.s,apply=True)
        self.assertEqual(n.read_state(self.s)['hashes'],self.h)
    def test_selfclosing_void_preserves_main(self):
        other=BODY.replace('<h1>','<img src="/x"/><h1>')
        self.assertEqual(self.h[U],n.fingerprint(U,other,HEAD))
    def test_private_input_rejected(self):
        with self.assertRaises(n.SafeError):n.process({n.ORIGIN+'/app/private':'a'*64},self.s,baseline=True)
    def test_202_is_pending_validation(self):
        n.process(self.h,self.s,baseline=True)
        key=next((n.ROOT/'public').glob('[0-9a-f]'*32+'.txt')).stem
        with patch.object(n,'request',side_effect=[(200,{},key),(202,{},'')]):
            r=n.process({U:'b'*64},self.s,apply=True)
        self.assertEqual(r['state'],'received_key_validation_pending')
    def test_server_error_blocks_blind_retry(self):
        n.process(self.h,self.s,baseline=True)
        key=next((n.ROOT/'public').glob('[0-9a-f]'*32+'.txt')).stem
        with patch.object(n,'request',side_effect=[(200,{},key),(503,{},'')]):
            with self.assertRaises(n.SafeError):n.process({U:'b'*64},self.s,apply=True)
        self.assertIn('pending',n.read_state(self.s))
    def test_wrong_live_key_blocks_before_post(self):
        n.process(self.h,self.s,baseline=True)
        with patch.object(n,'request',return_value=(200,{},'wrong')) as req:
            with self.assertRaises(n.SafeError):n.process({U:'b'*64},self.s,apply=True)
        self.assertEqual(req.call_count,1)
    def test_monitor_key_redacted(self):
        secret='unit-test-secret'
        r=b.audit(secret,lambda method:{'d':[{'note':secret}]})
        self.assertNotIn(secret,json.dumps(r))
    def test_monitor_error_does_not_leak(self):
        def fail(_):raise ValueError('unit-test-secret')
        r=b.audit('unit-test-secret',fail)
        self.assertTrue(r['apiErrors']);self.assertNotIn('unit-test-secret',json.dumps(r))

if __name__=='__main__': unittest.main()
