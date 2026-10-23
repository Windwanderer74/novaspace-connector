#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Version-bound original download and selected-page rendering in the assistant workspace.

Input is one JSON object on stdin; signed URLs never enter argv, reports or errors.
No Nextcloud mutations. Recheck source metadata with files_stat after completion.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

MAX_BYTES = 512 * 1024 * 1024
ORIGIN = 'https://connector.example.invalid'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('DOWNLOAD_REDIRECT_REJECTED')

def require(ok, code):
    if not ok:
        raise ValueError(code)

def tool(name):
    value = shutil.which(name)
    require(value is not None, 'RENDERER_UNAVAILABLE')
    return value

def process(command, warnings=None):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=45, check=False)
    require(result.returncode == 0, 'PDF_PROCESS_FAILED')
    require(len(result.stdout) <= 1024 * 1024 and len(result.stderr) <= 65536, 'PDF_PROCESS_OUTPUT_LIMIT')
    if warnings is not None and result.stderr.strip():
        warnings.append(Path(command[0]).name)
    return result.stdout.decode('utf-8', errors='replace')

def run(config):
    source = config['source']
    require(source['account'] == 'ChatGPT' and str(source['fileId']).isdigit(), 'SOURCE_IDENTITY_INVALID')
    require(isinstance(source['etag'], str) and re.fullmatch(r'"[^"\r\n]+"', source['etag']), 'SOURCE_VERSION_INVALID')
    size = source['size']
    require(isinstance(size, int) and 0 < size <= MAX_BYTES, 'SOURCE_SIZE_LIMIT')
    pages = config['pages']
    require(isinstance(pages, list) and 1 <= len(pages) <= 5 and len(set(pages)) == len(pages)
            and all(type(p) is int and p >= 1 for p in pages), 'PAGE_SELECTION_INVALID')
    tools = {name: tool(name) for name in ['pdfinfo', 'pdftoppm', 'pdftotext']}
    directory = Path(config['outputDirectory'])
    require(directory.is_absolute() and not directory.exists(), 'OUTPUT_ALREADY_EXISTS_OR_INVALID')
    directory.mkdir(mode=0o700, parents=True)
    original = directory / 'original.pdf'
    digest = hashlib.sha256()
    received = 0
    deadline = time.monotonic() + 180
    # Local input is reserved for reproducible synthetic integration fixtures.
    if config.get('receivedOriginalPath'):
        local=Path(config['receivedOriginalPath'])
        require(local.is_absolute() and local.is_file() and not local.is_symlink()
                and local.stat().st_size==size and 'downloadUrl' not in source
                and 'downloadAuthorization' not in source and not config.get('fixtureOnly'),
                'RECEIVED_ORIGINAL_INVALID')
        incoming=local.open('rb')
    elif config.get('fixturePath'):
        require(config.get('fixtureOnly') is True and 'downloadUrl' not in source, 'FIXTURE_MODE_INVALID')
        incoming = open(config['fixturePath'], 'rb')
    else:
        u = urlparse(source['downloadUrl'])
        require(u.scheme == 'https' and f'{u.scheme}://{u.netloc}' == ORIGIN and u.path == '/files-download'
                and not u.username and not u.password and not u.fragment, 'DOWNLOAD_ORIGIN_INVALID')
        headers={'Accept-Encoding':'identity'}
        authorization=source.get('downloadAuthorization')
        if authorization is not None:
            require(not u.query and isinstance(authorization,str) and len(authorization)<=8200
                    and re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',authorization) is not None,
                    'DOWNLOAD_AUTHORIZATION_INVALID')
            headers['Authorization']=authorization
        incoming = urllib.request.build_opener(NoRedirect()).open(
            urllib.request.Request(source['downloadUrl'], headers=headers), timeout=30)
        require(incoming.status == 200, 'DOWNLOAD_FAILED')
        require(incoming.headers.get('Content-Encoding', 'identity') == 'identity', 'DOWNLOAD_ENCODING_INVALID')
        length = incoming.headers.get('Content-Length')
        require(length is None or (length.isdigit() and int(length) == size), 'DOWNLOAD_LENGTH_MISMATCH')
    try:
        with original.open('xb') as output:
            os.chmod(original, 0o600)
            while True:
                require(time.monotonic() < deadline, 'DOWNLOAD_TIME_LIMIT')
                chunk = incoming.read(1024 * 1024)
                if not chunk:
                    break
                received += len(chunk)
                require(received <= size and received <= MAX_BYTES, 'DOWNLOAD_SIZE_MISMATCH')
                digest.update(chunk)
                output.write(chunk)
    finally:
        incoming.close()
    require(received == size, 'DOWNLOAD_TRUNCATED')
    sha256 = digest.hexdigest()
    expected = config.get('expectedSha256')
    require(expected is None or expected == sha256, 'SOURCE_HASH_MISMATCH')
    with original.open('rb') as stream:
        require(stream.read(5) == b'%PDF-', 'NOT_A_PDF')
    warnings = []
    info = process([tools['pdfinfo'], str(original)], warnings)
    match = re.search(r'^Pages:\s+(\d+)\s*$', info, re.M)
    require(match is not None, 'PAGE_COUNT_UNAVAILABLE')
    count = int(match.group(1))
    require(1 <= count <= 10000 and max(pages) <= count, 'PAGE_OUT_OF_RANGE')
    rendered = []
    for page in pages:
        prefix = directory / f'page-{page:05d}'
        process([tools['pdftoppm'], '-f', str(page), '-l', str(page), '-singlefile',
                 '-scale-to', '2400', '-png', str(original), str(prefix)], warnings)
        image = prefix.with_suffix('.png')
        require(image.is_file() and 0 < image.stat().st_size <= 16 * 1024 * 1024, 'PAGE_IMAGE_LIMIT')
        text = prefix.with_suffix('.txt')
        process([tools['pdftotext'], '-f', str(page), '-l', str(page), '-layout', '-enc', 'UTF-8', str(original), str(text)], warnings)
        require(text.is_file() and text.stat().st_size <= 1024 * 1024, 'PAGE_TEXT_LIMIT')
        extracted = text.read_text('utf-8').replace('\f', '').strip()
        rendered.append({'originalPage': page, 'imagePath': str(image), 'textPath': str(text),
                         'imageSha256': hashlib.sha256(image.read_bytes()).hexdigest(),
                         'textStatus': 'text' if extracted else 'no_text', 'textCharacters': len(extracted)})
    require(hashlib.sha256(original.read_bytes()).hexdigest() == sha256 if size <= 32 * 1024 * 1024
            else file_hash(original) == sha256, 'LOCAL_ORIGINAL_CHANGED')
    public_source = {key: source[key] for key in ['account', 'path', 'fileId', 'etag', 'size']}
    manifest = {'protocol': 1, 'source': public_source, 'sha256': sha256, 'pageCount': count,
                'originalPath': str(original), 'pages': rendered, 'ocrPerformed': False, 'rendererWarnings': sorted(set(warnings)),
                'fixtureOnly': config.get('fixtureOnly') is True,
                'originalInput': 'received-file' if config.get('receivedOriginalPath') else 'fixture' if config.get('fixturePath') else 'http-download',
                'sourceVersionRecheckRequired': True, 'visualInspectionPerformed': False,
                'renderer': 'Poppler pdftoppm; selected original pages; scale-to 2400',
                'note': 'Render complete. Inspect image bytes and recheck files_stat before marking source verified. Text extraction is not OCR.'}
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
    return {'status': 'rendered', 'manifestPath': str(directory / 'manifest.json'), **manifest}

def file_hash(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

if __name__ == '__main__':
    try:
        print(json.dumps(run(json.load(sys.stdin)), ensure_ascii=False))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z_]+', str(error)) else 'WORKBENCH_FAILED'
        print(json.dumps({'status': 'failed', 'error': code, 'note': 'No intake success; original in Nextcloud unchanged.'}))
        sys.exit(1)
