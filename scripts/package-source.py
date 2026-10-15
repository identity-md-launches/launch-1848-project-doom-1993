#!/usr/bin/env python3
"""Small, reproducible corresponding-host-source download. No dependencies/caches."""
from pathlib import Path
import gzip, io, tarfile
root=Path(__file__).resolve().parent.parent
names=['index.html','package.json','package-lock.json','tsconfig.json','vite.config.ts','README.md','DESIGN.md','LICENSE','dist/_headers','dist/source/index.html','dist/assets/share.svg']
for directory in ['src','scripts','engine']:
    names += [str(p.relative_to(root)) for p in (root/directory).rglob('*') if p.is_file()]
names += [str(p.relative_to(root)) for p in (root/'test').glob('*') if p.is_file()]
# Runtime assets and the separate C source archive are retained in the static export.
# Documentation/notices are also delivered at dist/docs, avoiding duplicate archives.
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w') as tar:
    for name in sorted(names):
        p=root/name
        if not p.exists():continue
        data=p.read_bytes();info=tarfile.TarInfo('site/'+name);info.size=len(data);info.mode=0o644;info.mtime=0
        tar.addfile(info,io.BytesIO(data))
output=root/'dist/source/site-source.tar.gz';output.parent.mkdir(parents=True,exist_ok=True)
with output.open('wb') as target:
    with gzip.GzipFile(filename='',mode='wb',fileobj=target,mtime=0,compresslevel=9) as stream:stream.write(buffer.getvalue())
print('Packaged corresponding host source:',output.stat().st_size,'bytes')
