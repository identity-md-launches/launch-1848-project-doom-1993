import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWad, serializeWad, mergeWads, validateGame, MAX_FILE } from '../src/wad.ts';
import { midiToMus, validateMus } from '../src/music.ts';
const lump=(name:string,bytes:number[]=[])=>( {name,bytes:new Uint8Array(bytes)} );
function wad(kind:'IWAD'|'PWAD'='PWAD'){const b=serializeWad([lump('TEST',[1,2,3])]);b.set(new TextEncoder().encode(kind));return b;}
test('accepts a bounded WAD and preserves bytes',()=>{const b=wad();assert.deepEqual(Array.from(parseWad(b,'PWAD').lumps[0].bytes),[1,2,3]);});
test('rejects non-WAD, truncated header and wrong kind',()=>{assert.throws(()=>parseWad(new Uint8Array(11)));assert.throws(()=>parseWad(new Uint8Array(20)));assert.throws(()=>parseWad(wad(),'IWAD'));});
test('rejects negative counts, directory overflow and negative or overflowing lump ranges',()=>{
 for(const [offset,value] of [[4,-1],[4,2147483647],[8,-1],[8,2147483647],[15,-1],[19,2147483647]]){const b=wad();new DataView(b.buffer).setInt32(offset,value,true);assert.throws(()=>parseWad(b));}
});
test('rejects oversized buffers before parsing',()=>assert.throws(()=>parseWad(new Uint8Array(MAX_FILE+1))));
test('rejects executable mod metadata and invalid name bytes',()=>{for(const name of ['DEHACKED','ZSCRIPT','BEHAVIOR','TEXTMAP']){const b=serializeWad([lump(name)]);b.set(new TextEncoder().encode('PWAD'));assert.throws(()=>parseWad(b));}const b=wad();b[23]=255;assert.throws(()=>parseWad(b));});
test('last enabled pack overrides assets and sprite additions stay inside namespace',()=>{const base={kind:'IWAD' as const,lumps:[lump('S_START'),lump('TROOA1',[1]),lump('S_END'),lump('DSPISTOL',[4])]};const pack={kind:'PWAD' as const,lumps:[lump('S_START'),lump('TROOA1',[2]),lump('TROOB1',[3]),lump('S_END'),lump('DSPISTOL',[5])]};const result=mergeWads(base,[pack]);assert.deepEqual(result.map(l=>l.name),['S_START','TROOA1','TROOB1','S_END','DSPISTOL']);assert.equal(result[1].bytes[0],2);assert.equal(result[4].bytes[0],5);assert.equal(base.lumps[1].bytes[0],1);});
test('rejects incomplete map overlays',()=>assert.throws(()=>mergeWads({kind:'IWAD',lumps:[]},[{kind:'PWAD',lumps:[lump('E1M1'),lump('THINGS')]}])));
test('rejects incomplete base game',()=>assert.throws(()=>validateGame([lump('TEST')])));
test('rejects truncated MUS and zero-time looping scores',()=>{const b=new Uint8Array(17);b.set([77,85,83,26,1,0,16,0]);b[16]=0x10;assert.throws(()=>validateMus(b));b[16]=0x60;assert.throws(()=>validateMus(b));});
test('MIDI conversion preserves playable notes and produces valid MUS',()=>{
 const b=new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,12,0,0x90,60,100,96,0x80,60,0,0,255,47,0]);const mus=midiToMus(b);assert.doesNotThrow(()=>validateMus(mus));assert.equal(new TextDecoder().decode(mus.subarray(0,3)),'MUS');
 for(let i=0;i<b.length;i++)assert.throws(()=>midiToMus(b.subarray(0,i)));
});
test('deterministic malformed headers terminate without accepting out-of-file ranges',()=>{
 let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let i=0;i<1000;i++){const b=wad(),v=new DataView(b.buffer);v.setUint32(4,random(),true);v.setUint32(8,random(),true);assert.throws(()=>parseWad(b));}
});
