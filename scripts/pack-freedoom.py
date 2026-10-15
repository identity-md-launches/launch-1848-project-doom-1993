#!/usr/bin/env python3
"""Recreate the shipped compressed asset from an owner-supplied official 0.13.0 ZIP.
The input ZIP must match the official release checksum. No network or code execution.
"""
from pathlib import Path
import hashlib, lzma, sys, zipfile
if len(sys.argv) != 2: raise SystemExit('Usage: python3 scripts/pack-freedoom.py /path/to/freedoom-0.13.0.zip')
p=Path(sys.argv[1]);digest=hashlib.sha256(p.read_bytes()).hexdigest()
if digest!='3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59':raise SystemExit('Official release ZIP checksum mismatch')
with zipfile.ZipFile(p) as z: data=z.read('freedoom-0.13.0/freedoom1.wad')
if hashlib.sha256(data).hexdigest()!='7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d':raise SystemExit('WAD checksum mismatch')
compressed=lzma.compress(data,format=lzma.FORMAT_ALONE,preset=6)
compressed=compressed[:5]+len(data).to_bytes(8,'little')+compressed[13:]
if hashlib.sha256(compressed).hexdigest()!='a6701455c4354448aaa1a18bae5a716f7316c91023818f6fa1dc23e9577ff692':raise SystemExit('Encoder output differs; review liblzma version and update integrity metadata together')
(Path(__file__).resolve().parent.parent/'dist/assets/freedoom1.wad.lzma').write_bytes(compressed)
print('Recreated complete Freedoom Phase 1 asset.')
