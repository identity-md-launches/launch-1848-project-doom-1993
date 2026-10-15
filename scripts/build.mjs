import { rm, mkdir, copyFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await rm('dist/app', { recursive: true, force: true });
const result = spawnSync('vite', ['build'], { stdio: 'inherit', shell: false });
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir('dist/docs', {recursive:true});
for(const name of ['SECURITY_AUDIT.md','TEST_REPORT.md','LICENSE_REPORT.md','MODDING.md','FREEDOOM_COPYING.txt','FREEDOOM_CREDITS.txt','FREEDOOM_CREDITS-MUSIC.txt','LZMA_MIT.txt','NUKED_OPL_LGPL-2.1.txt','SILKSCREEN_OFL.txt','VITE_MIT.txt']){
  // Static source-download users retain dist/docs instead of duplicating notices.
  try{await access(`artifacts/${name}`);await copyFile(`artifacts/${name}`,`dist/docs/${name}`);}catch{await access(`dist/docs/${name}`);}
}
await copyFile('LICENSE','dist/docs/GPL-2.0.txt');
const source=spawnSync('python3',['scripts/package-source.py'],{stdio:'inherit',shell:false});
process.exit(source.status??1);
