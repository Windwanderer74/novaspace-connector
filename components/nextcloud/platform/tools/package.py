#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Verify the explicit file manifest and build deterministic source/app archives."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import gzip
import hashlib
import io
import json
import sys
import tarfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'dist'
manifest_path = root / 'SHA256SUMS.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
entries = {}
for relative, expected in manifest.items():
    parts = PurePosixPath(relative)
    if parts.is_absolute() or '..' in parts.parts or not parts.parts or '\\' in relative:
        raise SystemExit('Unsafe manifest path')
    current = root
    for part in parts.parts:
        current = current / part
        if current.is_symlink():
            raise SystemExit('Symlink in package source: ' + relative)
    if not current.is_file():
        raise SystemExit('Missing package source: ' + relative)
    data = current.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit('Source hash mismatch: ' + relative)
    entries[relative] = data
required = {'app/appinfo/info.xml', 'app/appinfo/routes.php', 'app/LICENSE', 'LICENSE', 'SOURCE_PROVENANCE.json', 'INSTALL.md'}
if not required.issubset(entries):
    raise SystemExit('Incomplete package manifest')
entries['SHA256SUMS.json'] = manifest_path.read_bytes()
output.mkdir(parents=True, exist_ok=True)
timestamp = int(datetime(2026, 10, 23, tzinfo=timezone.utc).timestamp())
def archive(name, prefix, members):
    target = output / name
    if target.exists():
        raise SystemExit('Output already exists: ' + str(target))
    with target.open('xb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w', format=tarfile.PAX_FORMAT) as package:
                for relative, data in sorted(members.items()):
                    item = tarfile.TarInfo(prefix + '/' + relative)
                    item.size = len(data)
                    item.mtime = timestamp
                    item.mode = 0o644
                    item.uid = item.gid = 0
                    item.uname = item.gname = ''
                    package.addfile(item, io.BytesIO(data))
    return {'path': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'files': len(members)}
results = [
    archive('novaspace-platform-source-2026-10-23.tar.gz', 'novaspace-platform-source', entries),
    archive('novaspace-platform-app-source-2026-10-23.tar.gz', 'novaspace_platform', {p[4:]: data for p, data in entries.items() if p.startswith('app/')}),
]
print(json.dumps({'manifestFilesVerified': len(manifest), 'archives': results}, indent=2))
