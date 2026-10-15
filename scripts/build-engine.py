#!/usr/bin/env python3
"""Build complete bundled corresponding source with verified Zig 0.16.0 installed by owner.
No downloads or third-party package scripts run here. Outputs stay in dist/assets.
"""
import os, pathlib, shutil, subprocess, tarfile, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
zig = os.environ.get('IMD_ZIG', 'zig')
version = subprocess.check_output([zig, 'version'], text=True).strip()
if version != '0.16.0': raise SystemExit('Use Zig 0.16.0 for the recorded build.')
with tempfile.TemporaryDirectory(prefix='imd-doom-build-') as temporary:
    target = pathlib.Path(temporary)
    with tarfile.open(root / 'dist/source/wasmdoom-source.tar.xz') as archive:
        for member in archive.getmembers():
            if not member.isfile() or not member.name.startswith('wasmdoom/') or '..' in pathlib.PurePosixPath(member.name).parts:
                raise SystemExit('Unexpected source archive entry')
        archive.extractall(target, filter='data')
    subprocess.run([zig, 'build', '-Doptimize=ReleaseSmall', '--cache-dir', str(target/'cache'),
                    '--global-cache-dir', str(target/'global-cache')], cwd=target/'wasmdoom', check=True)
    for name, output in [('wasmdoom', 'doom'), ('wasmdoom.music', 'music')]:
        shutil.copyfile(target/'wasmdoom/zig-out/bin'/f'{name}.wasm', root/'dist/assets'/f'{output}.wasm')
print('Built Doom and music from bundled C source.')
