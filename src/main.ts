import { parseWad, MAX_FILE, MAX_PACK } from './wad.ts';
import { GameAudio } from './audio.ts';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('canvas'),ctx=canvas.getContext('2d',{alpha:false})!;
const play=$<HTMLButtonElement>('play'),launch=$('launch'),pause=$<HTMLButtonElement>('pause'),restart=$<HTMLButtonElement>('restart');
const status=$('status'),error=$('error'),audio=new GameAudio();
let worker:Worker|null=null,running=false,paused=false,loading=false,lastMessage=0,watchdog:ReturnType<typeof setInterval>|null=null;
let base:{name:string;buffer:ArrayBuffer}|null=null;
type Pack={id:number;name:string;buffer:ArrayBuffer;enabled:boolean};let packs:Pack[]=[],packId=0;
const keys=new Set<number>();let mouseButtons=0,weapon=1;
let readingFile=false;
const message=(s:string)=>{status.textContent=s;};
const showError=(s:string)=>{error.textContent=s;error.hidden=false;};
function clearError(){error.hidden=true;error.textContent='';}
function release(){for(const key of keys)worker?.postMessage({type:'key',key,down:false});keys.clear();mouseButtons=0;worker?.postMessage({type:'mouse',buttons:0,dx:0});}
function setPause(value:boolean){if(!running)return;paused=value;release();worker?.postMessage({type:'pause',paused});audio.pause(paused);pause.textContent=paused?'Resume':'Pause';$('session-state').textContent=paused?'Paused':'Playing';if(paused&&document.pointerLockElement)document.exitPointerLock();if(!paused)canvas.focus();}
function stop(){release();worker?.terminate();worker=null;audio.stop();running=false;loading=false;paused=false;$('setup').inert=false;if(watchdog)clearInterval(watchdog);watchdog=null;if(document.pointerLockElement)document.exitPointerLock();pause.disabled=true;restart.disabled=true;}
function recover(reason:string){stop();launch.hidden=false;play.disabled=false;play.textContent='Try again';$('launch-title').textContent='Game stopped.';$('launch-copy').textContent='Change the game or packs, then retry.';$('load-note').textContent='Your selected files remain in this tab.';$('session-state').textContent='Stopped';showError(reason);message('');}
async function start(){
  if(readingFile){message('Wait for the selected file to finish loading.');return;}
  launch.hidden=false;canvas.dataset.ticks='0';
  stop();clearError();loading=true;$('setup').inert=true;play.disabled=true;play.textContent='Loading…';$('launch-title').textContent='Entering the arena.';$('launch-copy').textContent='Preparing your local session.';message('Loading the engine…');$('session-state').textContent='Loading';
  // Some browsers leave resume pending when no audio output is available.
  // Gameplay must be able to start independently of the audio device.
  void audio.start().catch(()=>message('Audio is unavailable; gameplay can continue.'));
  try{worker=new Worker(new URL('./engine.worker.ts',import.meta.url),{type:'module'});}
  catch{recover('This browser could not start the game worker. Try a current browser.');return;}
  lastMessage=Date.now();
  worker.onmessage=(e:MessageEvent)=>{
    lastMessage=Date.now();const d=e.data;
    if(d.type==='progress'){message(d.message);$('load-note').textContent=d.message;}
    else if(d.type==='ready'){loading=false;running=true;paused=false;launch.hidden=true;pause.disabled=false;restart.disabled=false;pause.textContent='Pause';$('session-state').textContent='Playing';$('game-label').textContent=base?base.name:'Freedoom: Phase 1';$('setup').inert=false;$('apply').hidden=true;message(`${packs.filter(p=>p.enabled).length} resource packs active. Session progress stays in this tab.`);canvas.focus();updateTouch();}
    else if(d.type==='frame'){ctx.putImageData(new ImageData(d.rgba,320,200),0,0);audio.music(d.sound);canvas.dataset.ticks=String(d.ticks);}
    else if(d.type==='sfx')audio.sfx(d);
    else if(d.type==='voice')audio.update(d);
    else if(d.type==='error')recover(`This session could not continue: ${d.message}. Try Freedoom without resource packs.`);
    else if(d.type==='event'){
      if(d.tag===101){const [episode,map]=d.values;$('session-state').textContent=`Playing · ${episode===0?'MAP'+String(map).padStart(2,'0'):'E'+episode+'M'+map}`;}
      if(d.tag===111)message('You died. Press Space or tap Use to respawn.');
    }
  };
  worker.onerror=()=>recover('The game worker stopped unexpectedly. Reload and try again.');
  watchdog=setInterval(()=>{if(document.hidden){lastMessage=Date.now();return;}if(Date.now()-lastMessage>(loading?45000:8000))recover('The game stopped responding. Its worker was closed; try a smaller or compatible pack.');},2000);
  worker.postMessage({type:'init',baseUrl:new URL('./',document.baseURI).href,base:base?.buffer??null,packs:packs.filter(p=>p.enabled).map(p=>p.buffer),skill:Number($<HTMLSelectElement>('difficulty').value)});
}
play.addEventListener('click',()=>void start());pause.addEventListener('click',()=>setPause(!paused));
const dialog=$<HTMLDialogElement>('restart-dialog');let dialogWasPaused=false;
function askRestart(){if(!running){void start();return;}dialogWasPaused=paused;setPause(true);dialog.showModal();}
restart.addEventListener('click',askRestart);$('apply').addEventListener('click',askRestart);
dialog.addEventListener('close',()=>{if(dialog.returnValue==='restart')void start();else setPause(dialogWasPaused);dialog.returnValue='';});
$('sound').addEventListener('click',()=>{audio.mute(!audio.muted);$('sound').textContent=audio.muted?'Enable sound':'Mute sound';$('sound').setAttribute('aria-pressed',String(audio.muted));});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch{message('Fullscreen is unavailable in this browser. You can still play in the page.');}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen ⤢';});
canvas.addEventListener('click',()=>{if(!running)return;if(paused)setPause(false);canvas.focus();if(matchMedia('(pointer:fine)').matches){try{const request=canvas.requestPointerLock();if(request)void request.catch(()=>message('Mouse capture was declined. Use arrow keys to turn.'));}catch{message('Use arrow keys to turn; mouse capture is unavailable.');}}});
const keyMap:Record<string,number>={KeyW:173,KeyS:175,KeyA:44,KeyD:46,ArrowUp:173,ArrowDown:175,ArrowLeft:172,ArrowRight:174,ControlLeft:157,ControlRight:157,Space:32,KeyE:32,ShiftLeft:182,ShiftRight:182,Enter:13,Escape:27,Backspace:127,KeyM:9,Digit1:49,Digit2:50,Digit3:51,Digit4:52,Digit5:53,Digit6:54,Digit7:55,Equal:61,Minus:45};
function key(key:number,down:boolean){if(!running||paused)return;if(down){if(keys.has(key))return;keys.add(key);}else keys.delete(key);worker?.postMessage({type:'key',key,down});}
canvas.addEventListener('keydown',(e)=>{if(e.code==='Tab'){release();return;}if(e.repeat)return;const k=keyMap[e.code]??(e.key.length===1&&/^[a-z]$/.test(e.key)?e.key.charCodeAt(0):undefined);if(k!==undefined){e.preventDefault();key(k,true);}});
window.addEventListener('keyup',(e)=>{const k=keyMap[e.code]??(e.key.length===1?e.key.charCodeAt(0):undefined);if(k!==undefined&&keys.has(k)){key(k,false);}});
canvas.addEventListener('blur',release);
window.addEventListener('blur',()=>{if(running)setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)setPause(true);});
document.addEventListener('pointerlockchange',()=>{release();});
document.addEventListener('mousemove',(e)=>{if(document.pointerLockElement===canvas&&running&&!paused)worker?.postMessage({type:'mouse',buttons:mouseButtons,dx:e.movementX});});
canvas.addEventListener('mousedown',(e)=>{if(document.pointerLockElement===canvas&&e.button===0){mouseButtons=1;worker?.postMessage({type:'mouse',buttons:1,dx:0});}});
window.addEventListener('mouseup',()=>{if(mouseButtons){mouseButtons=0;worker?.postMessage({type:'mouse',buttons:0,dx:0});}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')){
 const code=Number(button.dataset.key);
 button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);key(code,true);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>key(code,false));
 button.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();key(code,true);}});
 button.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')key(code,false);});
}
$('touch-weapon').addEventListener('click',()=>{weapon=weapon%7+1;key(48+weapon,true);setTimeout(()=>key(48+weapon,false),80);});
function updateTouch(){$('touch-controls').hidden=!running||!matchMedia('(max-width:800px), (pointer:coarse)').matches;}
window.addEventListener('resize',updateTouch);
function changed(){if(running){$('apply').hidden=false;message('Setup changed. Apply changes to begin a new session.');}else if(!loading){play.textContent='Start game';$('launch-title').textContent='Back in the fight.';$('launch-copy').textContent=base?base.name:'Freedoom Phase 1 · All 36 levels';}}
$<HTMLSelectElement>('difficulty').addEventListener('change',changed);
$('choose-base').addEventListener('click',()=>$<HTMLInputElement>('base-file').click());
$('choose-pack').addEventListener('click',()=>$<HTMLInputElement>('pack-file').click());
async function readInput(input:HTMLInputElement,kind:'IWAD'|'PWAD'){
 const f=input.files?.[0];input.value='';if(!f)return;clearError();
 if(readingFile||loading){showError('Wait for the current file or game to finish loading.');return;}readingFile=true;
 try{
  if(!/\.wad$/i.test(f.name))throw new Error('Choose a .wad file. Archives and executables are not supported.');
  if(f.size>(kind==='IWAD'?MAX_FILE:MAX_PACK))throw new Error(`The file exceeds ${kind==='IWAD'?48:16} MiB.`);
  if(kind==='PWAD'&&(packs.length>=4||packs.reduce((n,p)=>n+p.buffer.byteLength,0)+f.size>32*1024*1024))throw new Error('Use at most four packs and 32 MiB of packs in total.');
  const buffer=await f.arrayBuffer();parseWad(new Uint8Array(buffer),kind);
  if(kind==='IWAD'){base={name:f.name,buffer};$('base-name').textContent=f.name;$('base-detail').textContent=`Local IWAD · ${(f.size/1048576).toFixed(1)} MiB`;$('reset-base').hidden=false;}
  else{packs.push({id:++packId,name:f.name,buffer,enabled:true});renderPacks();}
  changed();message('WAD directory checked. Maps and assets are checked together when you start.');
 }catch(e){showError(e instanceof Error?e.message:'The file could not be read.');}finally{readingFile=false;}
}
$<HTMLInputElement>('base-file').addEventListener('change',e=>void readInput(e.target as HTMLInputElement,'IWAD'));
$<HTMLInputElement>('pack-file').addEventListener('change',e=>void readInput(e.target as HTMLInputElement,'PWAD'));
$('reset-base').addEventListener('click',()=>{base=null;$('base-name').textContent='Freedoom: Phase 1';$('base-detail').textContent='Free assets · Included';$('reset-base').hidden=true;clearError();changed();});
function renderPacks(){
 const list=$('pack-list');list.replaceChildren();$('pack-count').textContent=`${packs.length} / 4`;
 if(!packs.length){const p=document.createElement('p');p.className='empty';p.textContent='Make it your Doom.';list.append(p);}
 packs.forEach((pack,i)=>{
  const row=document.createElement('div');row.className='pack-row';const label=document.createElement('label');label.className='pack-name';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=pack.enabled;checkbox.addEventListener('change',()=>{pack.enabled=checkbox.checked;changed();});
  const name=document.createElement('span');name.textContent=pack.name;label.append(checkbox,name);row.append(label);
  const actions=document.createElement('div');actions.className='pack-actions';const up=document.createElement('button');up.textContent='Move up';up.setAttribute('aria-label',`Move ${pack.name} up`);up.disabled=i===0;up.onclick=()=>{[packs[i-1],packs[i]]=[packs[i],packs[i-1]];renderPacks();changed();};const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${pack.name}`);remove.onclick=()=>{packs=packs.filter(p=>p.id!==pack.id);renderPacks();changed();};actions.append(up,remove);row.append(actions);list.append(row);
 });
}
// A real frame from the bundled Freedoom release, captured during local engine testing.
const preview=new Image();preview.onload=()=>{if(!running)ctx.drawImage(preview,0,0,320,200);};preview.src=new URL('./assets/preview.png',document.baseURI).href;
window.addEventListener('pagehide',stop);

