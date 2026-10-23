# SPDX-License-Identifier: AGPL-3.0-or-later
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from email.message import Message

spec = importlib.util.spec_from_file_location('upload_original', Path(__file__).resolve().parents[1] / 'scripts/upload-original.py')
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class Reply(io.BytesIO):
    status = 200


class UploadClientTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / 'original.png'
        self.original = b'\x89PNG\r\n\x00\xfforiginal'
        self.source.write_bytes(self.original)
        self.prepared = dict(account='ChatGPT', path='/existing/original.png', size=len(self.original),
                             sha256=hashlib.sha256(self.original).hexdigest(), mimeType='image/png',
                             transfer=dict(method='PUT', url='https://connector.example.test/files-upload',
                                           authorization='Bearer short-lived-test-token'))
        self.calls = []

    def open(self, request, timeout):
        self.calls.append(request)
        return Reply(json.dumps(dict(verified=True, uploadCompleted=True, account='ChatGPT',
                                     path=self.prepared['path'], size=self.prepared['size'],
                                     sha256=self.prepared['sha256'], fileId='123', etag='"v1"')).encode())

    def test_legacy_preparation_uses_explicit_honest_identity_and_exact_bytes(self):
        self.assertTrue(client.upload(self.prepared, self.source, self)['verified'])
        self.assertEqual(len(self.calls), 1)
        req = self.calls[0]
        self.assertEqual(req.get_header('User-agent'), client.USER_AGENT)
        self.assertEqual(req.get_header('Authorization'), self.prepared['transfer']['authorization'])
        self.assertEqual(req.get_header('Content-type'), 'image/png')
        self.assertEqual(req.data, self.original)

    def test_current_preparation_headers_are_used(self):
        self.prepared['transfer']['userAgent'] = client.USER_AGENT
        self.prepared['transfer']['headers'] = {'Authorization': self.prepared['transfer']['authorization'],
                                               'Content-Type': 'image/png', 'User-Agent': client.USER_AGENT,
                                               'Accept': 'application/json'}
        self.assertTrue(client.upload(self.prepared, self.source, self)['verified'])
        self.assertEqual(len(self.calls), 1)

    def test_original_mismatch_never_sends(self):
        self.source.write_bytes(b'different')
        with self.assertRaises(ValueError):
            client.upload(self.prepared, self.source, self)
        self.assertEqual(self.calls, [])

    def test_edge_error_is_reported_without_credential_or_retry(self):
        def fail(request, timeout):
            self.calls.append(request)
            headers = Message()
            headers['cf-ray'] = 'ray-example'
            raise urllib.error.HTTPError(request.full_url, 403, 'Forbidden', headers, io.BytesIO(b'error code: 1010'))
        opener = type('Opener', (), {'open': staticmethod(fail)})()
        result = client.upload(self.prepared, self.source, opener)
        self.assertEqual(result['status'], 403)
        self.assertTrue(result['edgeError1010'])
        self.assertEqual(result['cfRay'], 'ray-example')
        self.assertNotIn('short-lived-test-token', json.dumps(result))
        self.assertEqual(len(self.calls), 1)

    def test_redirects_do_not_forward_the_credential(self):
        self.assertIsNone(client.NoRedirect().redirect_request(None, None, 307, '', {}, 'https://foreign.test/'))


if __name__ == '__main__':
    unittest.main()
