import LZMA from './lzma.js';
import { parseWad, mergeWads, validateGame, serializeWad } from './wad.ts';
type Engine = { memory: WebAssembly.Memory } & Record<string, any>;
let doom: Engine, music: Engine, timer: ReturnType<typeof setInterval> | undefined, paused=false, ticks=0;
let lastError='';
const send = (message: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer);
const progress = (message: string) => send({ type:'progress', message });
const sha = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))).map(n=>n.toString(16).padStart(2,'0')).join('');
async function fetchAsset(base: string, name: string, limit: number): Promise<Uint8Array> {
  const url=new URL(`assets/${name}`,base);
  if(url.origin!==self.location.origin) throw new Error('Asset origin does not match this site.');
  const r=await fetch(url,{credentials:'omit',redirect:'error'});
  if(!r.ok)throw new Error(`Could not load ${name}. Check the connection and retry.`);
  const declared=Number(r.headers.get('content-length')); if(declared>limit)throw new Error('Asset exceeds size limit.');
  if(!r.body)throw new Error('Streaming downloads are unavailable.');
  const reader=r.body.getReader(),parts:Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('Asset exceeds size limit.');}parts.push(value);}
  const out=new Uint8Array(total);let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;
}
async function instantiate(bytes: Uint8Array): Promise<Engine> {
  const mod=await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>);
  if(WebAssembly.Module.imports(mod).length)throw new Error('Engine unexpectedly requests host capabilities.');
  return (await WebAssembly.instantiate(mod,{})).exports as Engine;
}
function mem(ptr:number,len:number,cap=2*1024*1024):Uint8Array {
  if(!Number.isInteger(ptr)||!Number.isInteger(len)||ptr<0||len<0||len>cap||ptr+len>doom.memory.buffer.byteLength)throw new Error('Engine returned an invalid memory range.');
  return new Uint8Array(doom.memory.buffer,ptr,len);
}
function musicData(ptr:number,len:number):number {
  const bytes=mem(ptr,len,131072),p=music.wasmdoom_music_alloc(len);
  if(!p)throw new Error('Music exceeds its buffer limit.');new Uint8Array(music.memory.buffer,p,len).set(bytes);return p;
}
function events() {
  const bytes=mem(doom.wasmdoom_events_ptr(),doom.wasmdoom_events_len(),65536),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);
  let p=0;
  while(p+4<=bytes.length){const tag=v.getUint16(p,true),len=v.getUint16(p+2,true);p+=4;if(p+len>bytes.length)throw new Error('Invalid engine event.');
    const n=(offset:number)=>{if(offset+4>len)throw new Error('Truncated engine event.');return v.getInt32(p+offset,true);};
    if(tag===3)lastError=new TextDecoder().decode(bytes.subarray(p,p+len));
    if(tag===10){const pcm=mem(n(8),n(12)).slice();send({type:'sfx',handle:n(0),id:n(4),pcm,vol:n(16),pan:n(20),pitch:n(24)},[pcm.buffer]);}
    else if(tag===11||tag===12)send({type:'voice',tag,handle:n(0),vol:tag===12?n(4):0,pan:tag===12?n(8):0,pitch:tag===12?n(12):0});
    else if(tag===20){const len=n(4),ptr=musicData(n(0),len);music.wasmdoom_music_set_genmidi(ptr,len);}
    else if(tag===21){const len=n(8),ptr=musicData(n(4),len);music.wasmdoom_music_register(n(0),ptr,len);}
    else if(tag===22)music.wasmdoom_music_play(n(0),n(4));
    else if(tag>=23&&tag<=27){const method=['pause','resume','stop','unregister','set_volume'][tag-23];music[`wasmdoom_music_${method}`](n(0));}
    else if(tag>=100&&tag<180){const values=[];for(let j=0;j+4<=len && j<32;j+=4)values.push(n(j));send({type:'event',tag,values});}
    p+=len;
  } doom.wasmdoom_events_clear();
}
function tick(){
  if(paused){send({type:'heartbeat'});return;}
  try {
    doom.wasmdoom_tick();events();ticks++;
    const palette=mem(doom.wasmdoom_get_palette(),768),frame=mem(doom.wasmdoom_get_framebuffer(),64000),rgba=new Uint8ClampedArray(256000);
    for(let i=0;i<64000;i++){const c=frame[i]*3,p=i*4;rgba[p]=palette[c];rgba[p+1]=palette[c+1];rgba[p+2]=palette[c+2];rgba[p+3]=255;}
    const ptr=music.wasmdoom_music_render(1260),sound=new Float32Array(music.memory.buffer,ptr,2520).slice();
    send({type:'frame',rgba,sound,ticks},[rgba.buffer,sound.buffer]);
  }catch(e){fail(e);}
}
function fail(e:unknown){clearInterval(timer);try{if(doom)events();}catch{}send({type:'error',message:lastError|| (e instanceof Error?e.message:String(e))});}
async function init(data: { baseUrl: string; base: ArrayBuffer | null; packs: ArrayBuffer[]; skill: number }) {
  progress('Loading the engine…');
  const [engineBytes,musicBytes]=await Promise.all([fetchAsset(data.baseUrl,'doom.wasm',500000),fetchAsset(data.baseUrl,'music.wasm',100000)]);
  [doom,music]=await Promise.all([instantiate(engineBytes),instantiate(musicBytes)]);
  music.wasmdoom_music_init(44100);
  let bytes:Uint8Array;
  if(data.base)bytes=new Uint8Array(data.base);
  else {
    progress('Loading Freedoom Phase 1 · 6.8 MiB…');
    const compressed=await fetchAsset(data.baseUrl,'freedoom1.wad.lzma',7133327);
    if(compressed.length!==7133327||await sha(compressed)!=='a6701455c4354448aaa1a18bae5a716f7316c91023818f6fa1dc23e9577ff692')throw new Error('Freedoom integrity check failed. Reload the site.');
    progress('Unpacking Freedoom locally…');
    bytes=await new Promise<Uint8Array>((resolve,reject)=>LZMA.decompress(compressed,(value:Uint8Array|null,error:unknown)=>error?reject(error):resolve(value!),()=>{}));
    if(bytes.length!==28795076||await sha(bytes)!=='7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d')throw new Error('Unpacked game integrity check failed.');
  }
  progress('Checking maps and resource packs…');
  const base=parseWad(bytes,'IWAD'),packs=data.packs.map(b=>parseWad(new Uint8Array(b),'PWAD'));
  const lumps=mergeWads(base,packs),{mode,maps}=validateGame(lumps),wad=serializeWad(lumps);
  const ptr=doom.wasmdoom_wad_alloc(wad.length);if(!ptr)throw new Error('Not enough memory for this game.');
  new Uint8Array(doom.memory.buffer,ptr,wad.length).set(wad);
  const skill=Number.isInteger(data.skill)&&data.skill>=1&&data.skill<=5?data.skill:3;
  const args=['-mode',mode,'-skill',String(skill),'-warp','1',...(mode==='commercial'?[]:['1'])];
  new Uint8Array(doom.memory.buffer,doom.wasmdoom_argv_ptr(),4096).set(new TextEncoder().encode(args.join('\0')+'\0\0'));
  doom.wasmdoom_init();events();send({type:'ready',maps,mode});
  tick();timer=setInterval(tick,1000/35);
}
self.onmessage=(e:MessageEvent)=>{
  const d=e.data;
  if(d.type==='init')void init(d).catch(fail);
  else if(d.type==='pause')paused=!!d.paused;
  else if(doom&&d.type==='key'&&Number.isInteger(d.key)&&d.key>=0&&d.key<=255){try{doom[d.down?'wasmdoom_keydown':'wasmdoom_keyup'](d.key);}catch(e){fail(e);}}
  else if(doom&&d.type==='mouse'&&Number.isFinite(d.dx)){try{doom.wasmdoom_send_mouse(d.buttons&7,Math.max(-1000,Math.min(1000,d.dx|0)),0);}catch(e){fail(e);}}
};
