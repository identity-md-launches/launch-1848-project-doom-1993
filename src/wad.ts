import { midiToMus, validateMus } from './music.ts';
export const MAX_FILE = 48 * 1024 * 1024;
export const MAX_PACK = 16 * 1024 * 1024;
export const MAX_TOTAL = 80 * 1024 * 1024;
export const MAX_LUMPS = 16384;
export type Lump = { name: string; bytes: Uint8Array };
export type Wad = { kind: 'IWAD' | 'PWAD'; lumps: Lump[] };
const decoder = new TextDecoder('ascii');
const encoder = new TextEncoder();
const fail = (s: string): never => { throw new Error(s); };
const check = (ok: unknown, s: string): void => { if (!ok) fail(s); };
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const mapName = (s: string) => /^(E[1-4]M[1-9]|MAP(0[1-9]|[12][0-9]|3[0-2]))$/.test(s);
const mapParts = ['THINGS','LINEDEFS','SIDEDEFS','VERTEXES','SEGS','SSECTORS','NODES','SECTORS','REJECT','BLOCKMAP'];
const unsupported = /^(BEHAVIOR|SCRIPTS|TEXTMAP|ENDMAP|ZNODES|ZSCRIPT|DECORATE|DEHACKED|LOADACS|GAMEINFO|MAPINFO|UMAPINFO|GL_.*)$/;
const marker = (s: string) => /^(S|SS|F|FF|P|PP)[0-9]?_(START|END)$/.test(s);
export function parseWad(bytes: Uint8Array, expected?: 'IWAD' | 'PWAD'): Wad {
  check(bytes.length >= 12 && bytes.length <= MAX_FILE, 'Use a WAD between 12 bytes and 48 MiB.');
  const v = view(bytes), kind = decoder.decode(bytes.subarray(0, 4));
  check(kind === 'IWAD' || kind === 'PWAD', 'This is not a Doom WAD. Select an IWAD or PWAD file.');
  check(!expected || kind === expected, expected === 'IWAD' ? 'Select a complete IWAD as the base game.' : 'Select a PWAD resource pack.');
  const count = v.getInt32(4, true), dir = v.getInt32(8, true);
  check(count > 0 && count <= MAX_LUMPS && dir >= 12 && dir <= bytes.length && count <= (bytes.length - dir) / 16, 'The WAD directory is invalid or exceeds 16,384 entries.');
  const lumps: Lump[] = []; let expanded = 0;
  for (let i = 0; i < count; i++) {
    const p = dir + i * 16, offset = v.getInt32(p, true), len = v.getInt32(p + 4, true);
    check(offset >= 0 && len >= 0 && offset <= bytes.length && len <= bytes.length - offset, `Lump ${i + 1} extends outside the file.`);
    expanded += len; check(expanded <= MAX_TOTAL, 'Overlapping or oversized lump data exceeds 80 MiB.');
    const raw = bytes.subarray(p + 8, p + 16), zero = raw.indexOf(0), nameBytes = zero < 0 ? raw : raw.subarray(0, zero);
    check(nameBytes.length > 0 && nameBytes.every(c => c >= 33 && c <= 95), 'Lump names must use printable Doom characters.');
    const name = decoder.decode(nameBytes).toUpperCase();
    check(!unsupported.test(name) || (kind === 'IWAD' && ['DEHACKED','UMAPINFO','MAPINFO'].includes(name)), `${name} requires an extended engine. Use a vanilla Doom resource pack.`);
    lumps.push({ name, bytes: bytes.subarray(offset, offset + len) });
  }
  return { kind: kind as Wad['kind'], lumps };
}
export function serializeWad(lumps: Lump[]): Uint8Array {
  const size = 12 + lumps.length * 16 + lumps.reduce((n, l) => n + l.bytes.length, 0);
  check(lumps.length > 0 && lumps.length <= MAX_LUMPS && size <= MAX_TOTAL, 'The combined game exceeds its resource limit.');
  const out = new Uint8Array(size), v = view(out); out.set(encoder.encode('IWAD'));
  let p = 12, dir = size - lumps.length * 16; v.setInt32(4, lumps.length, true); v.setInt32(8, dir, true);
  for (const l of lumps) { out.set(l.bytes, p); v.setInt32(dir, p, true); v.setInt32(dir + 4, l.bytes.length, true); out.set(encoder.encode(l.name).subarray(0,8), dir + 8); p += l.bytes.length; dir += 16; }
  return out;
}
// Packs are data overlays. Complete map blocks replace maps; sprites/flats stay in
// their canonical namespaces. Last enabled pack wins. No executable mods.
export function mergeWads(base: Wad, packs: Wad[]): Lump[] {
  let result = base.lumps.map(l => ({ ...l }));
  for (const pack of packs) {
    let namespace = '';
    for (let i = 0; i < pack.lumps.length; i++) {
      const l = pack.lumps[i];
      if (/^(S|SS)_START$/.test(l.name)) { namespace = 'S'; continue; }
      if (/^(F|FF)_START$/.test(l.name)) { namespace = 'F'; continue; }
      if (/^(S|SS|F|FF)_END$/.test(l.name)) { namespace = ''; continue; }
      if (marker(l.name)) continue;
      if (mapName(l.name)) {
        const group = pack.lumps.slice(i, i + 11);
        check(group.length === 11 && mapParts.every((n,j) => group[j+1].name === n), `${l.name}: provide all ten vanilla map lumps in order.`);
        const at = result.findIndex(x => x.name === l.name);
        if (at >= 0) result.splice(at,11,...group); else result.push(...group);
        i += 10; continue;
      }
      check(!mapParts.includes(l.name), 'A map pack must include its map marker and every map lump.');
      const indices = result.flatMap((x,j) => x.name === l.name ? [j] : []);
      if (indices.length) for (const j of indices) result[j] = l;
      else if (namespace) { const at = result.findIndex(x => x.name === `${namespace}_END`); check(at >= 0, 'Base game is missing an asset namespace.'); result.splice(at,0,l); }
      else result.push(l);
    }
  }
  return result;
}
function validatePatch(l: Lump): { width: number; height: number } {
  const b = l.bytes, v = view(b);
  check(b.length >= 8, `${l.name}: truncated image.`);
  const w = v.getInt16(0,true), h = v.getInt16(2,true);
  check(w > 0 && w <= 1024 && h > 0 && h <= 255 && 8 + w*4 <= b.length, `${l.name}: unsupported image dimensions.`);
  for (let x = 0; x < w; x++) {
    let p = v.getUint32(8+x*4,true), posts = 0;
    check(p >= 8+w*4 && p < b.length, `${l.name}: invalid image column.`);
    while (b[p] !== 255) {
      check(p+4 <= b.length && ++posts <= 256, `${l.name}: unterminated image column.`);
      const len = b[p+1]; check(p+len+4 < b.length && b[p]+len <= h, `${l.name}: image post exceeds its bounds.`);
      p += len+4;
    }
  }
  return { width:w, height:h };
}
function validateMap(group: Lump[], flatNames: Set<string>): void {
  const name=group[0].name;
  check(group.length === 11 && mapParts.every((n,i)=>group[i+1].name===n), `${name}: incomplete vanilla map.`);
  const sizes = [0,10,14,30,4,12,4,28,26,0,0];
  const count = group.map((l,i)=>sizes[i] ? l.bytes.length/sizes[i] : 0);
  for (let i=1;i<=8;i++) check(Number.isInteger(count[i]) && count[i] <= 32767 && (i===7 || count[i]>0), `${name}: invalid ${group[i].name} records.`);
  const data=group.map(l=>view(l.bytes));
  const u=(i:number,p:number)=>data[i].getUint16(p,true);
  const index=(i:number,p:number,limit:number)=>check(u(i,p)<limit, `${name}: invalid ${group[i].name} reference.`);
  let player=false;
  for(let p=0;p<group[1].bytes.length;p+=10) if(u(1,p+6)===1) player=true;
  check(player, `${name}: no player-one start.`);
  for(let p=0;p<group[2].bytes.length;p+=14) {
    index(2,p,count[4]); index(2,p+2,count[4]); index(2,p+10,count[3]);
    const back=u(2,p+12); check(back===65535 || back<count[3], `${name}: invalid back side.`);
    check(!(u(2,p+4)&4) || back!==65535, `${name}: two-sided line is missing its back side.`);
  }
  for(let p=0;p<group[3].bytes.length;p+=30) index(3,p+28,count[8]);
  for(let p=0;p<group[8].bytes.length;p+=26) for(const offset of [4,12]) {
    const flat=decoder.decode(group[8].bytes.subarray(p+offset,p+offset+8)).replace(/\0.*$/,'').toUpperCase();
    check(flatNames.has(flat),`${name}: sector flat must resolve inside the flat namespace.`);
  }
  for(let p=0;p<group[5].bytes.length;p+=12) {
    index(5,p,count[4]); index(5,p+2,count[4]); index(5,p+6,count[2]);
    const side=u(5,p+8); check(side<2,`${name}: invalid segment side.`);
    check(u(2,u(5,p+6)*14+10+side*2)<count[3],`${name}: segment uses a missing side.`);
  }
  for(let p=0;p<group[6].bytes.length;p+=4) check(u(6,p)>0 && u(6,p+2)+u(6,p)<=count[5],`${name}: invalid subsector range.`);
  // Nodes must be a backwards-only tree, as produced by vanilla node builders.
  // This excludes cycles and bounds traversal depth without recursive validation.
  const depth=new Uint16Array(count[7]);
  for(let n=0;n<count[7];n++) for(const o of [24,26]) {
    const child=u(7,n*28+o);
    if(child&32768) check((child&32767)<count[6],`${name}: invalid subsector child.`);
    else { check(child<n,`${name}: cyclic or noncanonical BSP nodes.`); depth[n]=Math.max(depth[n],depth[child]+1); }
    check(depth[n]<=128,`${name}: BSP depth exceeds 128.`);
  }
  if(!count[7]) check(count[6]===1,`${name}: map needs BSP nodes.`);
  check(group[9].bytes.length>=Math.ceil(count[8]*count[8]/8),`${name}: truncated REJECT table.`);
  const block=group[10].bytes; check(block.length>=8 && block.length%2===0,`${name}: invalid BLOCKMAP.`);
  const w=u(10,4),h=u(10,6),cells=w*h;
  check(w>0 && h>0 && w<=512 && h<=512 && 8+cells*2<=block.length,`${name}: invalid block grid.`);
  const seen=new Set<number>(); let work=0;
  for(let j=0;j<cells;j++) {
    let off=u(10,8+j*2)*2;
    check(off>=8+cells*2 && off<block.length,`${name}: block list outside map.`);
    if(seen.has(off)) continue; seen.add(off);
    check(u(10,off)===0,`${name}: invalid block list header.`); off+=2;
    while(true) { check(off+2<=block.length && ++work<2000000,`${name}: unterminated block list.`); const n=u(10,off);off+=2;if(n===65535)break;check(n<count[2],`${name}: block line outside map.`); }
  }
}
export function validateGame(lumps: Lump[]): { mode: string; maps: string[] } {
  check(lumps.length<=MAX_LUMPS,'Too many combined lumps.');
  const names=new Map(lumps.map(l=>[l.name,l]));
  for(const name of ['PLAYPAL','COLORMAP','PNAMES','TEXTURE1','S_START','S_END','F_START','F_END']) check(names.has(name),`Base game is missing ${name}.`);
  check(names.get('PLAYPAL')!.bytes.length>=14*768,'PLAYPAL needs 14 palettes.');
  check(names.get('COLORMAP')!.bytes.length>=34*256,'COLORMAP is truncated.');
  const ranges: [number, number][] = [];
  for (const prefix of ['S', 'F']) {
    const starts = lumps.flatMap((l,i) => l.name === prefix+'_START' ? [i] : []);
    const ends = lumps.flatMap((l,i) => l.name === prefix+'_END' ? [i] : []);
    check(starts.length === 1 && ends.length === 1 && starts[0] < ends[0], `Invalid ${prefix} namespace markers.`);
    ranges.push([starts[0], ends[0]]);
  }
  check(ranges[0][1] < ranges[1][0] || ranges[1][1] < ranges[0][0], 'Sprite and flat namespaces overlap.');
  // C resolves the last global occurrence of a name before subtracting firstflat.
  const indices=new Map(lumps.map((l,i)=>[l.name,i]));
  const flatNames=new Set([...indices].filter(([,i])=>i>ranges[1][0]&&i<ranges[1][1]).map(([name])=>name));
  const maps:string[]=[]; const patches=new Set<string>(); let section='';
  for(let i=0;i<lumps.length;i++) {
    const l=lumps[i];
    if(mapName(l.name)) { validateMap(lumps.slice(i,i+11),flatNames); maps.push(l.name); i+=10; continue; }
    if(l.name==='S_START') { section='sprite'; continue; } if(l.name==='F_START'){section='flat';continue;}
    if(l.name==='S_END'||l.name==='F_END'){section='';continue;}
    if(marker(l.name)) continue;
    // Vanilla r_things.c accepts 29 frames: A through ] (including [, backslash, ]).
    if(section==='sprite') { check(/^[A-Z0-9]{4}[A-\]][0-8]([A-\]][0-8])?$/.test(l.name),`${l.name}: invalid sprite name.`); validatePatch(l); }
    else if(section==='flat') check(l.bytes.length===4096,`${l.name}: flats must be 64 × 64 pixels.`);
    else if(/^(ST|WI|M_|AMMNUM|CWILV|BRDR|INTERPIC|TITLEPIC|CREDIT|HELP|VICTORY|ENDPIC|BOSSBACK|PFUB|END[0-9])/.test(l.name)) { patches.add(l.name); }
    if(l.name.startsWith('DS')) { const b=l.bytes; check(b.length>=8,`${l.name}: sound header is truncated.`);const v=view(b);check(v.getUint16(0,true)===3 && v.getUint16(2,true)>=4000 && v.getUint16(2,true)<=48000 && v.getUint32(4,true)<=b.length-8 && b.length<=2*1024*1024,`${l.name}: invalid DMX sound.`); }
    if(l.name.startsWith('D_')) {
      if(l.bytes[0]===77 && l.bytes[1]===84) l.bytes=midiToMus(l.bytes);
      validateMus(l.bytes);
    }
  }
  check(maps.includes('E1M1')||maps.includes('MAP01'),'Base game needs E1M1 or MAP01.');
  const pn=names.get('PNAMES')!.bytes; check(pn.length>=4,'PNAMES is truncated.'); const nv=view(pn), n=nv.getInt32(0,true);
  check(n>0 && n<=4096 && 4+n*8<=pn.length,'PNAMES count is invalid.');
  const patchNames:string[]=[];
  for(let i=0;i<n;i++) patchNames.push(decoder.decode(pn.subarray(4+i*8,12+i*8)).replace(/\0.*$/,'').toUpperCase());
  let textureCount=0;
  for(const name of ['TEXTURE1','TEXTURE2']) {
    const l=names.get(name); if(!l)continue;const b=l.bytes,v=view(b);check(b.length>=4,`${name}: truncated table.`);const count=v.getInt32(0,true);textureCount+=count;
    check(count>0 && textureCount<=4096 && 4+count*4<=b.length,`${name}: invalid count.`);
    for(let i=0;i<count;i++) {
      const p=v.getInt32(4+i*4,true);check(p>=4+count*4 && p+22<=b.length,`${name}: invalid offset.`);
      const w=v.getInt16(p+12,true),h=v.getInt16(p+14,true),parts=v.getInt16(p+20,true);
      check(w>0&&w<=1024&&h>0&&h<=256&&parts>0&&parts<=256&&p+22+parts*10<=b.length,`${name}: invalid texture dimensions or patches.`);
      for(let j=0;j<parts;j++){const index=v.getInt16(p+22+j*10+4,true);check(index>=0&&index<n&&names.has(patchNames[index]),`${name}: missing texture patch.`);patches.add(patchNames[index]);}
    }
  }
  for(const name of patches) validatePatch(names.get(name)!);
  return {mode:maps.includes('MAP01')?'commercial':maps.includes('E4M1')?'retail':maps.includes('E2M1')?'registered':'shareware',maps};
}
