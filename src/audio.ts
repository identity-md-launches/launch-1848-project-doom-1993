export class GameAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private next = 0;
  private voices = new Map<number, {src:AudioBufferSourceNode; gain:GainNode; pan:StereoPannerNode}>();
  muted = false;
  async start() { this.stop(); this.ctx = new AudioContext({ sampleRate:44100 }); this.master=this.ctx.createGain();this.master.gain.value=this.muted?0:0.7;this.master.connect(this.ctx.destination);await this.ctx.resume(); }
  stop() { if(this.ctx)void this.ctx.close();this.ctx=null;this.master=null;this.voices.clear();this.next=0; }
  mute(value:boolean){this.muted=value;if(this.master)this.master.gain.value=value?0:0.7;}
  pause(value:boolean){if(!this.ctx)return;this.next=0;if(value)void this.ctx.suspend();else void this.ctx.resume();}
  music(samples:Float32Array){
    const ctx=this.ctx;if(!ctx||ctx.state!=='running'||!this.master)return;
    const count=samples.length/2;if(count!==1260)return;
    const b=ctx.createBuffer(2,count,44100);
    for(let c=0;c<2;c++){const out=b.getChannelData(c);for(let i=0;i<count;i++){const n=samples[i*2+c];out[i]=Number.isFinite(n)?Math.max(-1,Math.min(1,n)):0;}}
    const source=ctx.createBufferSource();source.buffer=b;source.connect(this.master);
    if(this.next<ctx.currentTime||this.next>ctx.currentTime+0.3)this.next=ctx.currentTime+0.06;
    source.start(this.next);this.next+=count/44100;
  }
  sfx(d:{handle:number;pcm:Uint8Array;vol:number;pan:number;pitch:number}){
    const ctx=this.ctx;if(!ctx||!this.master||d.pcm.length<8||this.voices.size>=32)return;
    const v=new DataView(d.pcm.buffer,d.pcm.byteOffset,d.pcm.byteLength),rate=v.getUint16(2,true),count=v.getUint32(4,true);
    if(rate<4000||rate>48000||!count||count>d.pcm.length-8||count>2*1024*1024)return;
    const b=ctx.createBuffer(1,count,rate),out=b.getChannelData(0);for(let i=0;i<count;i++)out[i]=(d.pcm[i+8]-128)/128;
    const src=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();src.buffer=b;src.connect(gain).connect(pan).connect(this.master);
    this.voices.set(d.handle,{src,gain,pan});this.update({...d,tag:12});src.onended=()=>{this.voices.delete(d.handle);src.disconnect();gain.disconnect();pan.disconnect();};src.start();
  }
  update(d:{handle:number;tag:number;vol:number;pan:number;pitch:number}){const v=this.voices.get(d.handle);if(!v)return;if(d.tag===11){v.src.stop();this.voices.delete(d.handle);return;}v.gain.gain.value=Math.max(0,Math.min(1,d.vol/127));v.pan.pan.value=Math.max(-1,Math.min(1,(d.pan-128)/127));v.src.playbackRate.value=Math.max(0.1,Math.min(4,d.pitch/128));}
}
