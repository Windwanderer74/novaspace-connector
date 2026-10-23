# SPDX-License-Identifier: AGPL-3.0-or-later
import base64,hashlib,importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('assembly',root/'scripts/assemble-pdf-chunk.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
fixture=(root/'tests/fixtures/intake-pages.pdf').read_bytes()
class Tests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.output=self.tmp.name+'/output'
    def tearDown(self):self.tmp.cleanup()
    def part(self,data,offset=0):
        body=data[offset:offset+module.CHUNK];end=offset+len(body)
        return {'outputDirectory':self.output,'chunk':{'source':{'account':'ChatGPT','fileId':'6452','path':'/Prüfung.pdf','etag':'"original"','size':len(data)},'offset':offset,'length':len(body),'chunkSize':module.CHUNK,'encoding':'base64','bytesBase64':base64.b64encode(body).decode(),'sha256':hashlib.sha256(body).hexdigest(),'sourceVersionStillCurrent':True,'nextOffset':end if end<len(data) else None}}
    def test_actual_pdf_bytes_framing_and_full_hash(self):
        data=json.dumps(self.part(fixture),ensure_ascii=False).encode();frame=str(len(data)).encode()+b'\n'+data
        p=subprocess.run(['python3',str(root/'scripts/assemble-pdf-chunk.py')],input=frame,capture_output=True);self.assertEqual(p.returncode,0,p.stdout);r=json.loads(p.stdout);self.assertEqual(r['status'],'complete');self.assertEqual(Path(r['originalPath']).read_bytes(),fixture);self.assertEqual(r['sha256'],hashlib.sha256(fixture).hexdigest());self.assertTrue(r['sourceVersionRecheckRequired']);self.assertFalse(r['visualInspectionPerformed'])
    def test_multiple_binary_chunks_reconstruct_original(self):
        data=fixture+b'\n%'+b'x'*(module.CHUNK+127)
        r=module.run(self.part(data));self.assertEqual(r['status'],'partial');r=module.run(self.part(data,module.CHUNK));self.assertEqual(r['status'],'complete');self.assertEqual(Path(r['originalPath']).read_bytes(),data);self.assertEqual(r['sha256'],hashlib.sha256(data).hexdigest())
    def test_hash_drift_wrong_source_and_duplicate_preserve_partial(self):
        data=fixture+b'x'*module.CHUNK;c=self.part(data);c['chunk']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'CHUNK_HASH_OR_LENGTH_MISMATCH'):module.run(c)
        self.assertFalse(Path(self.output).exists());module.run(self.part(data));partial=Path(self.output)/'original.partial';before=partial.read_bytes();c=self.part(data,module.CHUNK);c['chunk']['source']['etag']='"changed"'
        with self.assertRaisesRegex(ValueError,'SOURCE_OR_SEQUENCE_CHANGED'):module.run(c)
        with self.assertRaisesRegex(ValueError,'OUTPUT_OCCUPIED_OR_NOT_PDF'):module.run(self.part(data))
        self.assertEqual(partial.read_bytes(),before)
    def test_truncated_frame_has_no_output_file(self):
        p=subprocess.run(['python3',str(root/'scripts/assemble-pdf-chunk.py')],input=b'100\n{}',capture_output=True);self.assertNotEqual(p.returncode,0);self.assertEqual(json.loads(p.stdout)['error'],'FRAME_TRUNCATED');self.assertFalse(Path(self.output).exists())
if __name__=='__main__':unittest.main()
