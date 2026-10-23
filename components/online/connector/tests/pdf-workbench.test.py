# SPDX-License-Identifier: AGPL-3.0-or-later
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import hashlib

root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('workbench',root/'scripts/pdf-workbench.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fixture=root/'tests/fixtures/intake-pages.pdf'
class Input(io.BytesIO):
    status=200
    def __init__(self,bytes,headers=None):super().__init__(bytes);self.headers=headers or {}
class Opener:
    def __init__(self,response):self.response=response;self.request=None
    def open(self,request,**kwargs):self.request=request;return self.response
class Tests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.count=0
    def tearDown(self):self.tmp.cleanup()
    def config(self,bytes=None,pages=None):
        self.count+=1;return {'source':{'account':'ChatGPT','path':'/Fixture.pdf','fileId':'99','etag':'"fixture"','size':len(bytes or fixture.read_bytes()),'downloadUrl':module.ORIGIN+'/files-download?token=DO-NOT-LOG-THIS'},'pages':pages or [1,2,3],'outputDirectory':self.tmp.name+'/run-'+str(self.count)}
    def invoke(self,config,bytes=None,headers=None):
        with patch.object(module.urllib.request,'build_opener',return_value=Opener(Input(bytes or fixture.read_bytes(),headers))):return module.run(config)
    def test_exact_pages_hash_no_text_and_no_secret(self):
        r=self.invoke(self.config());self.assertEqual(r['pageCount'],3);self.assertEqual([p['originalPage'] for p in r['pages']],[1,2,3]);self.assertEqual(r['pages'][1]['textStatus'],'no_text');self.assertEqual(r['sha256'],hashlib.sha256(fixture.read_bytes()).hexdigest());self.assertFalse(r['ocrPerformed']);self.assertTrue(r['sourceVersionRecheckRequired']);self.assertFalse(r['visualInspectionPerformed']);self.assertNotIn('DO-NOT-LOG',json.dumps(r));self.assertEqual((Path(r['originalPath'])).read_bytes(),fixture.read_bytes())
    def test_file_larger_than_native_bridge_limit(self):
        large=fixture.read_bytes()+b'\n% synthetic padding\n'+b'%'+b'x'*(24*1024*1024)+b'\n';r=self.invoke(self.config(large,[2,3]),large);self.assertGreater(r['source']['size'],20*1024*1024);self.assertEqual([p['originalPage'] for p in r['pages']],[2,3]);self.assertEqual(r['sha256'],hashlib.sha256(large).hexdigest())
    def test_hash_mismatch_truncation_and_encoding(self):
        c=self.config();c['expectedSha256']='a'*64
        with self.assertRaisesRegex(ValueError,'SOURCE_HASH_MISMATCH'):self.invoke(c)
        c=self.config();c['source']['size']+=1
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_TRUNCATED'):self.invoke(c)
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_ENCODING_INVALID'):self.invoke(self.config(),headers={'Content-Encoding':'gzip'})
    def test_limits_page_identity_and_collisions(self):
        c=self.config();c['source']['size']=module.MAX_BYTES+1
        with self.assertRaisesRegex(ValueError,'SOURCE_SIZE_LIMIT'):module.run(c)
        with self.assertRaisesRegex(ValueError,'PAGE_OUT_OF_RANGE'):self.invoke(self.config(pages=[4]))
        c=self.config();r=self.invoke(c)
        with self.assertRaisesRegex(ValueError,'OUTPUT_ALREADY_EXISTS_OR_INVALID'):self.invoke(c)
    def test_origin_and_redirects(self):
        c=self.config();c['source']['downloadUrl']='https://evil.example/files-download?token=private'
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_ORIGIN_INVALID'):module.run(c)
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_REDIRECT_REJECTED'):module.NoRedirect().redirect_request(None,None,302,'',{},'https://evil.example')
    def test_header_authorization_is_origin_bound_and_not_in_manifest(self):
        c=self.config();c['source']['downloadUrl']=module.ORIGIN+'/files-download';c['source']['downloadAuthorization']='Bearer scopedfile.signature'
        opener=Opener(Input(fixture.read_bytes()))
        with patch.object(module.urllib.request,'build_opener',return_value=opener):r=module.run(c)
        self.assertEqual(opener.request.get_header('Authorization'),'Bearer scopedfile.signature')
        self.assertNotIn('scopedfile.signature',json.dumps(r));self.assertNotIn('scopedfile.signature',Path(r['manifestPath']).read_text())
        for url,auth in [(module.ORIGIN+'/files-download?token=other','Bearer scopedfile.signature'),(module.ORIGIN+'/files-download','Bearer scopedfile.signature\r\nInjected: value'),('https://evil.example/files-download','Bearer scopedfile.signature')]:
            c=self.config();c['source']['downloadUrl']=url;c['source']['downloadAuthorization']=auth
            with patch.object(module.urllib.request,'build_opener') as factory:
                with self.assertRaises(ValueError):module.run(c)
                factory.assert_not_called()
    def test_received_original_is_real_input_and_does_not_open_a_link(self):
        c=self.config();del c['source']['downloadUrl'];local=Path(self.tmp.name)/'received.pdf';local.write_bytes(fixture.read_bytes());c['receivedOriginalPath']=str(local)
        with patch.object(module.urllib.request,'build_opener') as factory:r=module.run(c);factory.assert_not_called()
        self.assertFalse(r['fixtureOnly']);self.assertEqual(r['originalInput'],'received-file');self.assertEqual(r['sha256'],hashlib.sha256(fixture.read_bytes()).hexdigest());self.assertEqual(r['pageCount'],3)
        c=self.config();c['receivedOriginalPath']=str(local)
        with self.assertRaisesRegex(ValueError,'RECEIVED_ORIGINAL_INVALID'):module.run(c)
if __name__=='__main__':unittest.main()
