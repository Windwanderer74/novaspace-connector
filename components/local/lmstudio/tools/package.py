#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Package only the reviewed, hash-pinned public source inputs."""
import argparse, gzip, hashlib, io, json, tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
output = args.output.resolve()
try:
    output.relative_to(root)
except ValueError:
    pass
else:
    raise SystemExit('Write the archive outside the source component.')
manifest = json.loads((root / 'SHA256SUMS.json').read_text())
files = dict(manifest['files'])
files['SHA256SUMS.json'] = hashlib.sha256((root / 'SHA256SUMS.json').read_bytes()).hexdigest()
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as archive:
    for name, expected in sorted(files.items()):
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise SystemExit('Invalid manifest path')
        path = root / relative
        if path.is_symlink() or not path.is_file():
            raise SystemExit('Expected a regular source file: ' + name)
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise SystemExit('Source checksum changed: ' + name)
        info = tarfile.TarInfo('novaspace-lmstudio-source/' + name)
        info.size = len(data)
        info.mode = 0o755 if name.endswith('.sh') else 0o644
        info.mtime = 0
        archive.addfile(info, io.BytesIO(data))
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('wb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        compressed.write(buffer.getvalue())
print(json.dumps({'archive': str(output), 'files': len(files), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
