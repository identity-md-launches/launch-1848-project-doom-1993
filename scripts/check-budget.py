#!/usr/bin/env python3
"""Conservative sum of submission file bytes (stronger than compressed Git bundle size).
No ignore file is created or modified. Inputs, protected paths and ephemeral tests are omitted.
"""
from pathlib import Path
import os, sys
limit = 8388608
excluded = {'.git', '.github', '.imd', '.agents', '.codex', '.aws'}
files=[]; bad=[]
for parent,dirs,names in os.walk('.'):
    relative=Path(parent)
    dirs[:] = [d for d in dirs if d not in excluded and not (relative==Path('test') and d=='scratch')]
    for d in dirs:
        if d in {'node_modules','.cache','.npm','.zig-cache','zig-out','__pycache__'}: bad.append(str(relative/d))
    for name in names:
        p=relative/name
        if name.startswith('.env'):continue
        if p.is_symlink():bad.append(str(p)+' (symlink)')
        else:files.append((str(p),p.stat().st_size))
        if name.endswith(('.tgz','.deb','.whl')):bad.append(str(p))
total=sum(size for _,size in files)
print(f'{len(files)} files; {total:,} bytes / {limit:,}; {limit-total:,} bytes remaining')
for name,size in sorted(files,key=lambda pair:pair[1],reverse=True)[:8]:print(f'{size:>9}  {name}')
if bad:print('Unwanted generated paths:',bad)
if total>limit or bad:sys.exit(1)
