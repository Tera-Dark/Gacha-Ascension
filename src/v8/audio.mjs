/** Small synthesized cues. No downloads, tracking, or audio during offline recovery. */
const KEY='gacha-ascension-v8-muted-v1';
let context=null,muted=false,paused=false,lastAt=-Infinity;
try{muted=globalThis.localStorage?.getItem(KEY)==='1'}catch{}
export const isMuted=()=>muted;
export function setMuted(value){muted=!!value;try{globalThis.localStorage?.setItem(KEY,muted?'1':'0')}catch{}if(muted)context?.suspend();else unlockAudio()}
export function unlockAudio(){
 if(muted||paused)return;
 try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;context??=new Audio();context.resume().catch(()=>{})}catch{}
}
export function pauseAudio(hidden){paused=hidden;if(hidden)context?.suspend();else if(context&&!muted)context.resume().catch(()=>{})}
export function sound(kind){
 if(muted||paused||!context||context.state!=='running')return false;
 const t=context.currentTime;if(t-lastAt<.045)return false;lastAt=t;
 const tunes={attack:[240,110],enemy:[130,65],warning:[180,180,340],draw:[392,523,784],craft:[440,660],breakthrough:[262,392,523,784],victory:[392,523],loss:[196,130]};
 const notes=tunes[kind];if(!notes)return false;
 notes.forEach((f,i)=>{const osc=context.createOscillator(),gain=context.createGain(),start=t+i*.075;
  osc.type=kind==='attack'?'sawtooth':'triangle';osc.frequency.setValueAtTime(f,start);
  gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.11);
  osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+.12);osc.onended=()=>{osc.disconnect();gain.disconnect()};
 });return true;
}
