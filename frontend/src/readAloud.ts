export type SpeechPhase='idle'|'loading'|'playing'|'paused'|'ready'|'error';
export type SpeechState={owner:string;phase:SpeechPhase;error:string;time:number;duration:number};
export const idleSpeech:SpeechState={owner:'',phase:'idle',error:'',time:0,duration:0};

// One audio element owns playback across all answers. A stale request cannot
// resume speech after stopping, changing chats, or choosing another answer.
export class ReadAloudController{
 private state:SpeechState=idleSpeech;
 private listeners=new Set<()=>void>();
 private audio:HTMLAudioElement|null=null;
 private request:AbortController|null=null;
 private url='';
 private revision=0;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
 snapshot=()=>this.state;
 private mediaSession():MediaSession|null{
  return typeof navigator!=='undefined'&&'mediaSession' in navigator?navigator.mediaSession:null;
 }
 private bindMediaSession(text:string,voice:string){
  const session=this.mediaSession();if(!session)return;
  const snippet=text.replace(/\s+/g,' ').trim().slice(0,72)||'Озвучка ответа';
  try{
   if(typeof MediaMetadata!=='undefined'){
    session.metadata=new MediaMetadata({
     title:snippet,
     artist:'LLM Chat · Озвучка',
     album:voice,
     artwork:[
      {src:'/icon-192.png',sizes:'192x192',type:'image/png'},
      {src:'/icon-512.png',sizes:'512x512',type:'image/png'},
     ],
    });
   }
  }catch{}
  const bind=(action:MediaSessionAction,handler:MediaSessionActionHandler|null)=>{try{session.setActionHandler(action,handler)}catch{}};
  bind('play',()=>{if(this.state.phase!=='playing')void this.toggle()});
  bind('pause',()=>{if(this.state.phase==='playing')void this.toggle()});
  bind('stop',()=>this.stop());
  bind('seekbackward',details=>{this.seek(this.state.time-(details?.seekOffset||10))});
  bind('seekforward',details=>{this.seek(this.state.time+(details?.seekOffset||10))});
  bind('seekto',details=>{if(typeof details?.seekTime==='number')this.seek(details.seekTime)});
 }
 private syncMediaPosition(){
  const session=this.mediaSession(),audio=this.audio;
  if(!session||!audio||typeof session.setPositionState!=='function'||!(this.state.duration>0))return;
  try{
   session.setPositionState({
    duration:this.state.duration,
    playbackRate:audio.playbackRate||1,
    position:Math.max(0,Math.min(this.state.duration,audio.currentTime||0)),
   });
  }catch{}
 }
 private clearMediaSession(){
  const session=this.mediaSession();if(!session)return;
  try{session.playbackState='none';session.metadata=null}catch{}
  (['play','pause','stop','seekbackward','seekforward','seekto'] as const).forEach(action=>{try{session.setActionHandler(action,null)}catch{}});
 }
 private update(patch:Partial<SpeechState>){
  this.state={...this.state,...patch};
  const session=this.mediaSession();
  if(session){
   try{
    session.playbackState=this.state.phase==='playing'?'playing':this.state.phase==='paused'||this.state.phase==='ready'?'paused':'none';
   }catch{}
  }
  this.listeners.forEach(fn=>fn());
 }
 stop=(owner?:string)=>{
  if(owner&&this.state.owner!==owner)return;
  this.revision++;this.request?.abort();this.request=null;
  if(this.audio){this.audio.onended=null;this.audio.ontimeupdate=null;this.audio.onloadedmetadata=null;this.audio.onerror=null;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.audio=null}
  if(this.url){URL.revokeObjectURL(this.url);this.url=''}
  this.clearMediaSession();
  this.state=idleSpeech;this.listeners.forEach(fn=>fn());
 };
 async start(owner:string,text:string,voice:string,rate:number){
  this.stop();const revision=this.revision,request=new AbortController();this.request=request;
  const audio=new Audio();this.audio=audio;audio.preload='auto';audio.playbackRate=rate;
  // Unlock this same element during the tap on iOS. If Safari still requires
  // another gesture after fetching, leave the prepared audio ready to play.
  audio.src='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
  void audio.play().catch(()=>{});
  this.bindMediaSession(text,voice);
  this.update({owner,phase:'loading',error:'',time:0,duration:0});
  try{
   const response=await fetch('/api/tts',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':'application/json'},body:JSON.stringify({text,voice}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(245000)])});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(typeof data.detail==='string'?data.detail:`Озвучка недоступна (${response.status}). Попробуйте ещё раз.`)}
   const blob=await response.blob();if(revision!==this.revision)return;
   if(!blob.size)throw new Error('Сервер вернул пустую запись. Попробуйте ещё раз.');
   this.url=URL.createObjectURL(blob);audio.src=this.url;
   audio.onloadedmetadata=()=>{if(revision===this.revision){this.update({duration:Number.isFinite(audio.duration)?audio.duration:0});this.syncMediaPosition()}};
   audio.ontimeupdate=()=>{if(revision===this.revision){this.update({time:audio.currentTime});this.syncMediaPosition()}};
   audio.onended=()=>{if(revision===this.revision){this.update({phase:'ready',time:0});this.syncMediaPosition()}};
   audio.onerror=()=>{if(revision===this.revision)this.update({phase:'error',error:'Не удалось воспроизвести запись. Попробуйте ещё раз.'})};
   this.update({phase:'ready'});
   try{await audio.play();if(revision===this.revision){this.update({phase:'playing'});this.syncMediaPosition()}}catch(error){if(revision===this.revision&&!(error instanceof DOMException&&error.name==='NotAllowedError'))this.update({phase:'error',error:'Не удалось воспроизвести запись. Попробуйте ещё раз.'})}
  }catch(error){
   if(revision!==this.revision)return;
   this.update({phase:'error',error:error instanceof Error&&error.name==='TimeoutError'?'Озвучка заняла слишком долго. Попробуйте текст короче.':error instanceof TypeError?'Не удалось связаться с сервером озвучки.':error instanceof Error?error.message:'Не удалось озвучить ответ.'});
  }finally{if(revision===this.revision)this.request=null}
 }
 async toggle(){
  const audio=this.audio,revision=this.revision;if(!audio)return;
  if(this.state.phase==='playing'){audio.pause();this.update({phase:'paused'});this.syncMediaPosition();return}
  if(!['paused','ready'].includes(this.state.phase))return;
  if(audio.ended)audio.currentTime=0;
  try{await audio.play();if(revision===this.revision){this.update({phase:'playing',error:''});this.syncMediaPosition()}}catch{if(revision===this.revision)this.update({phase:'ready',error:'Нажмите воспроизведение ещё раз.'})}
 }
 rate(value:number){if(this.audio){this.audio.playbackRate=value;this.syncMediaPosition()}}
 seek(value:number){if(this.audio&&this.state.duration>0){this.audio.currentTime=Math.max(0,Math.min(value,this.state.duration));this.update({time:this.audio.currentTime});this.syncMediaPosition()}}
}
export const readAloud=new ReadAloudController();
