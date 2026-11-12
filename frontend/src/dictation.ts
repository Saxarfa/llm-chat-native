export const DICTATION_SECONDS=120;
const MAX_BYTES=12*1024*1024;

export function appendDictation(draft:string,text:string){
 const spoken=text.trim();if(!spoken)return draft;
 return draft+(draft&&!/\s$/.test(draft)?' ':'')+spoken;
}
export function recordingMime(supported:(type:string)=>boolean){
 return ['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(supported)||'';
}
export function microphoneError(error:unknown){
 const name=error instanceof DOMException?error.name:'';
 if(name==='NotAllowedError'||name==='SecurityError')return 'Разреши доступ к микрофону в настройках сайта, затем попробуй снова.';
 if(name==='NotFoundError')return 'Микрофон не найден. Подключи его и попробуй ещё раз.';
 if(name==='NotReadableError')return 'Микрофон занят другим приложением. Освободи его и попробуй снова.';
 return error instanceof Error?error.message:'Не удалось начать запись.';
}

export class DictationCapture{
 private stream?:MediaStream;
 private recorder?:MediaRecorder;
 private context?:AudioContext;
 private analyser?:AnalyserNode;
 private samples?:Uint8Array<ArrayBuffer>;
 private chunks:Blob[]=[];
 private size=0;
 private cancelled=false;
 private resolve?: (audio:Blob)=>void;
 private reject?: (error:Error)=>void;
 constructor(private onError:(error:Error)=>void){}
 async start(){
  // Create the audio context in the tap gesture; recording works even if the meter is unavailable.
  try{this.context=new AudioContext();void this.context.resume().catch(()=>{})}catch{}
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(this.cancelled){stream.getTracks().forEach(track=>track.stop());return false}
  this.stream=stream;
  try{
   const mime=recordingMime(type=>MediaRecorder.isTypeSupported(type));
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);this.recorder=recorder;
   if(this.context){try{this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.context.createMediaStreamSource(stream).connect(this.analyser);this.samples=new Uint8Array(this.analyser.fftSize)}catch{}}
   recorder.ondataavailable=event=>{if(!this.cancelled&&event.data.size){this.size+=event.data.size;this.chunks.push(event.data)}};
   recorder.onerror=()=>{const error=new Error('Запись прервалась. Попробуй ещё раз.');this.reject?.(error);this.onError(error);this.cancel()};
   recorder.onstop=()=>{
    const audio=new Blob(this.chunks,{type:recorder.mimeType||this.chunks[0]?.type||mime});this.chunks=[];this.release();
    if(this.cancelled)return;
    if(this.size>MAX_BYTES)this.reject?.(new Error('Запись слишком большая. Попробуй запись короче.'));
    else if(!audio.size)this.reject?.(new Error('Запись пустая. Попробуй ещё раз.'));
    else this.resolve?.(audio);
   };
   stream.getAudioTracks().forEach(track=>track.onended=()=>{if(!this.cancelled&&recorder.state==='recording'){this.onError(new Error('Микрофон отключился. Запиши сообщение ещё раз.'));this.cancel()}});
   recorder.start(1000);return true;
  }catch(error){this.release();throw error}
 }
 level(){
  if(!this.analyser||!this.samples)return 0;
  this.analyser.getByteTimeDomainData(this.samples);let sum=0;
  for(const sample of this.samples)sum+=((sample-128)/128)**2;
  return Math.min(1,Math.sqrt(sum/this.samples.length)*5);
 }
 stop(){
  return new Promise<Blob>((resolve,reject)=>{
   if(!this.recorder||this.recorder.state!=='recording'){reject(new Error('Запись уже завершена.'));return}
   this.resolve=resolve;this.reject=reject;this.recorder.stop();
  });
 }
 private release(){
  this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop()});this.stream=undefined;
  if(this.context){void this.context.close().catch(()=>{});this.context=undefined}
  this.analyser=undefined;this.samples=undefined;
 }
 cancel(){
  this.cancelled=true;
  if(this.recorder&&this.recorder.state!=='inactive')this.recorder.stop();
  this.reject?.(new DOMException('Диктовка отменена','AbortError'));
  this.chunks=[];this.release();
 }
}
