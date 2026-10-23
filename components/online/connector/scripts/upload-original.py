#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Upload original bytes once; read the prepare response from stdin, never a token argument."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = 'NOVAFORGE-FileTransfer/1.0'


def read_prepared():
    if not sys.stdin.isatty():
        return json.load(sys.stdin)
    import termios
    previous = termios.tcgetattr(sys.stdin)
    hidden = termios.tcgetattr(sys.stdin)
    hidden[3] &= ~termios.ECHO
    try:
        termios.tcsetattr(sys.stdin, termios.TCSANOW, hidden)
        print('Ready for upload preparation JSON on stdin (input is hidden).', file=sys.stderr, flush=True)
        return json.loads(sys.stdin.readline())
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSANOW, previous)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def upload(prepared, source, opener=None):
    """One authenticated PUT, with exact local validation and no automatic retry."""
    original = Path(source).read_bytes()
    checksum = hashlib.sha256(original).hexdigest()
    if len(original) != prepared['size'] or checksum != prepared['sha256']:
        raise ValueError('Lokale Originalgröße oder SHA-256 weicht von der Vorbereitung ab.')
    transfer = prepared['transfer']
    url = urllib.parse.urlsplit(transfer['url'])
    if (transfer['method'] != 'PUT' or url.scheme != 'https' or not url.hostname
            or url.username or url.password or url.query or url.fragment or url.path != '/files-upload'):
        raise ValueError('Ungültiger vorbereiteter Uploadweg.')
    headers = {
        'Authorization': transfer['authorization'],
        'Content-Type': prepared['mimeType'],
        'User-Agent': transfer.get('userAgent', USER_AGENT),
        'Accept': 'application/json',
    }
    for name, value in transfer.get('headers', {}).items():
        if name.lower() not in ('authorization', 'content-type', 'user-agent', 'accept'):
            raise ValueError('Unerwarteter Transferheader.')
        headers[name] = value
    if (headers['Authorization'] != transfer['authorization']
            or headers['Content-Type'] != prepared['mimeType']
            or not headers['User-Agent'] or headers['User-Agent'].startswith('Python-urllib/')):
        raise ValueError('Uploadheader stimmen nicht mit der Vorbereitung überein.')
    request = urllib.request.Request(transfer['url'], data=original, headers=headers, method='PUT')
    opener = opener or urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=120) as response:
            raw = response.read(131073)
            if len(raw) > 131072:
                raise ValueError('Uploadantwort zu groß. Denselben Zielpfad prüfen.')
            result = json.loads(raw)
            valid = (response.status == 200 and result.get('verified') is True
                     and result.get('uploadCompleted') is True
                     and result.get('path') == prepared['path']
                     and result.get('account') == prepared['account']
                     and result.get('size') == len(original)
                     and result.get('sha256') == checksum
                     and str(result.get('fileId', '')).isdigit() and bool(result.get('etag')))
            if not valid:
                return {'verified': False, 'uploadCompleted': False, 'status': response.status,
                        'path': prepared['path'], 'nextStep': 'Denselben Zielpfad mit files_stat prüfen; kein automatischer Wiederholungsversuch.'}
            return result
    except urllib.error.HTTPError as error:
        body = error.read(256).decode('utf-8', errors='replace')
        return {'verified': False, 'uploadCompleted': False, 'status': error.code,
                'cfRay': error.headers.get('cf-ray'), 'edgeError1010': 'error code: 1010' in body,
                'path': prepared['path'], 'nextStep': 'Denselben Zielpfad mit files_stat prüfen; kein automatischer Wiederholungsversuch.'}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Genau einen lokalen Originalpfad angeben; Vorbereitung als JSON über stdin.')
        prepared = read_prepared()
        result = upload(prepared, sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result.get('verified') is True else 2)
    except Exception:
        # A transport exception may contain headers. Never expose its text/token.
        print(json.dumps({'verified': False, 'uploadCompleted': False,
                          'error': 'Upload nicht bestätigt. Vorbereitung, lokale Datei und denselben Zielpfad prüfen; kein automatischer Wiederholungsversuch.'}))
        sys.exit(2)
