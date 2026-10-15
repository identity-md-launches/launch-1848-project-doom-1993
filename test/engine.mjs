import fs from 'node:fs';import assert from 'node:assert/strict';
import LZMA from '../src/lzma.js';import {parseWad,validateGame,serializeWad,mergeWads} from '../src/wad.ts';
const wasm=await WebAssembly.compile(fs.readFileSync('dist/assets/doom.wasm'));
assert.deepEqual(WebAssembly.Module.imports(wasm),[]);
const musicModule=await WebAssembly.compile(fs.readFileSync('dist/assets/music.wasm'));assert.deepEqual(WebAssembly.Module.imports(musicModule),[]);
const base=parseWad(LZMA.decompress(new Uint8Array(fs.readFileSync('dist/assets/freedoom1.wad.lzma'))),'IWAD');
const meta=validateGame(base.lumps),wad=serializeWad(base.lumps);let booted=0;
async function engine(bytes,episode=1,map=1){const d=(await WebAssembly.instantiate(wasm,{})).exports;const p=d.wasmdoom_wad_alloc(bytes.length);assert.ok(p);new Uint8Array(d.memory.buffer,p,bytes.length).set(bytes);new Uint8Array(d.memory.buffer,d.wasmdoom_argv_ptr(),4096).set(new TextEncoder().encode(['-mode','retail','-skill','1','-warp',String(episode),String(map),'',''].join('\0')));d.wasmdoom_init();return d;}
function drain(d){const events=[];const v=new DataView(d.memory.buffer);let p=d.wasmdoom_events_ptr(),end=p+d.wasmdoom_events_len();while(p<end){const tag=v.getUint16(p,true),len=v.getUint16(p+2,true);p+=4;events.push({tag,bytes:new Uint8Array(d.memory.buffer,p,len).slice()});p+=len;}d.wasmdoom_events_clear();for(const e of events)if(e.tag===3)throw Error(new TextDecoder().decode(e.bytes));return events;}
function snapshot(d){d.wasmdoom_snapshot_player();return new Int32Array(d.memory.buffer,d.wasmdoom_player_snapshot_ptr(),41).slice();}
let d;
for(const name of meta.maps){console.log("Checking",name);d=await engine(wad,Number(name[1]),Number(name[3]));drain(d);for(let i=0;i<50;i++){try{d.wasmdoom_tick();}catch(e){drain(d);throw e;}drain(d);}assert.equal(snapshot(d)[0],100);booted++;}
console.log(`${booted} Freedoom maps booted and simulated for 50 ticks each.`);
d=await engine(wad);drain(d);for(let i=0;i<50;i++)d.wasmdoom_tick();drain(d);const before=snapshot(d);d.wasmdoom_keydown(173);d.wasmdoom_keydown(157);const events=[];for(let i=0;i<200;i++){d.wasmdoom_tick();events.push(...drain(d));}d.wasmdoom_keyup(173);d.wasmdoom_keyup(157);const after=snapshot(d);assert.ok(after[32]!==before[32]||after[33]!==before[33]);assert.ok(after[18]<before[18]);assert.ok(events.some(e=>e.tag===120));assert.ok(events.some(e=>e.tag===132));assert.ok(events.some(e=>e.tag===10));
d.wasmdoom_keydown(49);for(let i=0;i<60;i++)d.wasmdoom_tick();d.wasmdoom_keyup(49);assert.equal(snapshot(d)[3],0);
console.log('Movement, firing/ammo use, enemy awareness, sound events and fist weapon switch passed.');
// Test a real walk-over exit with a PWAD derived from the bundled E1M1 map.
const fixture=base.lumps.map(l=>({...l})),at=fixture.findIndex(l=>l.name==='E1M1');const lines=fixture[at+2].bytes.slice();new DataView(lines.buffer).setUint16(834*14+6,52,true);fixture[at+2]={name:'LINEDEFS',bytes:lines};validateGame(fixture);d=await engine(serializeWad(fixture));drain(d);for(let i=0;i<50;i++)d.wasmdoom_tick();drain(d);d.wasmdoom_keydown(173);let completed=false,loaded=false;for(let i=0;i<600;i++){if(i%40===0)d.wasmdoom_keydown(157);if(i%40===1)d.wasmdoom_keyup(157);d.wasmdoom_tick();for(const e of drain(d)){if(e.tag===102)completed=true;if(e.tag===101&&new DataView(e.bytes.buffer).getUint32(4,true)===2)loaded=true;}}assert.ok(completed);assert.ok(loaded);console.log('Walk-over exit -> intermission -> E1M2 transition passed.');
const m=(await WebAssembly.instantiate(musicModule,{})).exports;m.wasmdoom_music_init(44100);
for(const [name,method] of [['GENMIDI','wasmdoom_music_set_genmidi'],['D_E1M1','wasmdoom_music_register']]){const b=base.lumps.find(l=>l.name===name).bytes,p=m.wasmdoom_music_alloc(b.length);new Uint8Array(m.memory.buffer,p,b.length).set(b);if(name==='GENMIDI')m[method](p,b.length);else m[method](1,p,b.length);}
m.wasmdoom_music_play(1,1);let peak=0;for(let i=0;i<100;i++){const p=m.wasmdoom_music_render(1260),b=new Float32Array(m.memory.buffer,p,2520);for(const n of b)peak=Math.max(peak,Math.abs(n));}assert.ok(peak>0.001);console.log('MIDI->MUS->OPL music generated non-silent PCM; peak',peak);
// C bounds guard exercised without the JavaScript validator.
for(const bytes of [new Uint8Array(12),new Uint8Array([73,87,65,68,255,255,255,127,12,0,0,0])])await assert.rejects(()=>engine(bytes));
console.log('Native WAD guards rejected malformed headers. Engine tests passed.');

// Regression fixtures for three independent-review findings.
function edited(edit){const l=base.lumps.map(x=>({...x}));edit(l);return l;}
assert.throws(()=>validateGame(edited(l=>{const at=l.findIndex(x=>x.name==='S_START')+1;l.splice(at,0,{name:l[at].name,bytes:new Uint8Array(0)});})),/truncated image/);
assert.throws(()=>validateGame(edited(l=>{const at=l.findIndex(x=>x.name==='S_START')+1;l.splice(at,0,{name:'F_END',bytes:new Uint8Array(0)});})),/namespace/);
const highOffset=edited(l=>{const at=l.findIndex(x=>x.name==='BLOCKMAP');const b=new Uint8Array(65540);b.set(l[at].bytes);const v=new DataView(b.buffer);v.setUint16(8,32768,true);v.setUint16(65536,0,true);v.setUint16(65538,65535,true);l[at]={name:'BLOCKMAP',bytes:b};});
validateGame(highOffset);d=await engine(serializeWad(highOffset));drain(d);for(let i=0;i<50;i++){d.wasmdoom_tick();drain(d);}
console.log('Duplicate-sprite and namespace regressions rejected; unsigned BLOCKMAP offset accepted and engine boot passed.');

// Visual-only enemy pack: change post pixel colors, keep dimensions/animation names.
const sprites=base.lumps.filter(l=>/^(POSS|BOSS|TROO)[A-Z][0-8]/.test(l.name)).map(l=>{
 const bytes=l.bytes.slice(),v=new DataView(bytes.buffer);const width=v.getInt16(0,true);
 for(let x=0;x<width;x++){let p=v.getUint32(8+x*4,true);while(bytes[p]!==255){for(let j=0;j<bytes[p+1];j++)bytes[p+3+j]=160;p+=bytes[p+1]+4;}}return {name:l.name,bytes};
});
const modded=mergeWads(base,[{kind:'PWAD',lumps:sprites}]);validateGame(modded);
async function appearance(bytes){const d=await engine(bytes);drain(d);for(let i=0;i<50;i++){d.wasmdoom_tick();drain(d);}d.wasmdoom_keydown(173);for(let i=0;i<145;i++){d.wasmdoom_tick();drain(d);}return {player:snapshot(d),frame:new Uint8Array(d.memory.buffer,d.wasmdoom_get_framebuffer(),64000).slice()};}
const originalAppearance=await appearance(wad),customAppearance=await appearance(serializeWad(modded));
assert.deepEqual(customAppearance.player,originalAppearance.player);assert.notDeepEqual(customAppearance.frame,originalAppearance.frame);
console.log('Enemy sprite PWAD changed the rendered appearance while preserving the deterministic player/game state.');

// Doom II uses frames beyond Z; these are valid vanilla frame identifiers.
const reference=base.lumps.find(l=>l.name==='TROOA1');
for(const frame of ['[',String.fromCharCode(92),']'])assert.doesNotThrow(()=>validateGame(edited(l=>{const at=l.findIndex(x=>x.name==='S_END');l.splice(at,0,{name:'TEST'+frame+'0',bytes:reference.bytes});})));
console.log('All 29 vanilla sprite frame identifiers accepted, including Doom II late frames.');
