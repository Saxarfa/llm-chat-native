// Metadata only: never collect request/response bodies, error messages or storage values.
type Fields=Record<string,unknown>;
type Entry={event:string,fields:Fields,at:number};
const numeric=new Set(['duration_ms','elapsed_ms','age_ms','status','characters','reasoning_characters','count','width','height','line','column','frame_median_ms','frame_p95_ms','frame_max_ms','jank_count']);
const tokens=new Set(['route','method','state','error_kind','error_code','source','build','client_id','browser','platform']);
const flags=new Set(['online','hidden','stopped','saved','partial']);
const safeToken=/^[\w./:{}-]{1,120}$/;
const tracePattern=/^[a-f0-9]{32}$/;
const segments=new Set(('api v1 upstream auth me login register logout profile settings chats chat generate stop regenerate edit status branches messages folders trash restore clear models model runtime operations load unload cancel probe inference sync events speech tts synthesize transcribe translation translate memory notes knowledge collections documents context usage compact pins proposals suggestions title variants backups preview presets workspaces image images video health props completions').split(' '));

export function diagnosticRoute(path:string){
 try{return new URL(path,'http://local').pathname.split('/').map(part=>!part||segments.has(part)?part:':id').join('/')}
 catch{return '/unknown'}
}
export function clientError(error:unknown):Fields{
 const object=error&&typeof error==='object'?error as {name?:unknown,stack?:unknown}:{};
 const kind=typeof object.name==='string'&&safeToken.test(object.name)?object.name:'Error';
 const frames:Fields[]=[];
 if(typeof object.stack==='string'){
  // Keep built JS basenames and positions; drop origins, paths, arguments and messages.
  const pattern=/\/([\w.-]+\.m?js):(\d+):(\d+)/g;
  for(const match of object.stack.matchAll(pattern)){
   frames.push({file:match[1],line:Number(match[2]),column:Number(match[3])});
   if(frames.length===8)break;
  }
 }
 return {error_kind:kind,error_code:kind.includes('Timeout')?'timeout':kind==='AbortError'?'cancelled':'unknown',frames};
}
export function clientWindowError(event:Pick<ErrorEvent,'error'|'message'>):Fields{
 const fields=clientError(event.error);
 // Browser layout notifications often have no Error object or stack. Match
 // only these exact infrastructure messages; never transmit the source text.
 if(event.message==='ResizeObserver loop completed with undelivered notifications.'||event.message==='ResizeObserver loop limit exceeded')fields.error_code='resize_observer_loop';
 return fields;
}
function publicFields(fields:Fields){
 const safe:Fields={};
 for(const [key,value] of Object.entries(fields)){
  if(numeric.has(key)&&typeof value==='number'&&Number.isFinite(value))safe[key]=Math.round(Math.max(0,Math.min(value,1e12)));
  else if(tokens.has(key)&&typeof value==='string'&&safeToken.test(value))safe[key]=value;
  else if(flags.has(key)&&typeof value==='boolean')safe[key]=value;
  else if(key==='trace_id'&&typeof value==='string'&&tracePattern.test(value))safe[key]=value;
  else if(key==='frames'&&Array.isArray(value))safe[key]=value.slice(0,8).map(item=>({
   ...(typeof item?.file==='string'&&/^[\w.-]+\.m?js$/.test(item.file)?{file:item.file}:{}),
   ...(typeof item?.line==='number'?{line:Math.min(Math.max(0,item.line),1e7)}:{}),
   ...(typeof item?.column==='number'?{column:Math.min(Math.max(0,item.column),1e7)}:{})}));
 }
 return safe;
}
const newId=()=>{
 if(typeof globalThis.crypto?.randomUUID==='function')return crypto.randomUUID().replaceAll('-','');
 const bytes=new Uint8Array(16);
 if(typeof globalThis.crypto?.getRandomValues==='function')crypto.getRandomValues(bytes);
 else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
};

export class BrowserDiagnostics{
 private queue:Entry[]=[];
 private owner:string|undefined;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private sending=false;
 private stopped=false;
 private repeats=new Map<string,{at:number,count:number}>();
 private dropped=0;
 readonly clientId=newId();
 constructor(private original:typeof fetch,private account:()=>string|undefined,private headers:()=>HeadersInit,
             private now:()=>number=()=>performance.now(),private context:()=>Fields=()=>({})){}
 private scope(){
  const current=this.account();
  if(current!==this.owner){this.owner=current;this.queue=[];this.repeats.clear();this.dropped=0}
  return current;
 }
 note(event:string,fields:Fields={},owner=this.account()){
  if(this.stopped||!owner||this.scope()!==owner)return;
  const safe=publicFields({...this.context(),...fields,client_id:this.clientId});
  const key=event+':'+String(safe.state??safe.error_kind??safe.route??'');
  const previous=this.repeats.get(key),now=this.now();
  if(previous&&now-previous.at<15000){if(++previous.count>10){this.dropped++;return}}
  else this.repeats.set(key,{at:now,count:1});
  if(this.repeats.size>128)this.repeats.delete(this.repeats.keys().next().value!);
  if(this.queue.length>=60){this.dropped++;return}
  this.queue.push({event,fields:safe,at:now});this.schedule();
 }
 private schedule(delay=5000){
  if(!this.timer&&!this.stopped)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush()},delay);
 }
 async flush(){
  const owner=this.scope();
  if(this.stopped||this.sending||!owner||!this.queue.length)return;
  this.sending=true;
  const batch=this.queue.slice(0,20),dropped=this.dropped;
  const events:Fields[]=batch.map(item=>({event:item.event,...item.fields,age_ms:this.now()-item.at}));
  if(dropped&&events.length<20)events.push({event:'client.dropped',count:dropped,client_id:this.clientId,age_ms:0});
  let delay=5000;
  try{
   const headers=new Headers(this.headers());headers.set('Content-Type','application/json');
   const response=await this.original('/api/diagnostics/events',{method:'POST',headers,body:JSON.stringify({events}),
    signal:AbortSignal.timeout(5000),keepalive:true});
   if(this.scope()!==owner)return;
   if(response.ok){this.queue.splice(0,batch.length);if(events.length>batch.length)this.dropped=Math.max(0,this.dropped-dropped)}
   else if(response.status===401){this.queue=[];this.dropped=0}
   else delay=response.status===429?60000:15000;
  }catch{delay=15000}finally{this.sending=false;if(this.queue.length)this.schedule(delay)}
 }
 fetch:typeof fetch=async(input,init)=>{
  let url:URL;
  try{url=new URL(input instanceof Request?input.url:String(input),location.href)}catch{return this.original(input,init)}
  if(url.origin!==location.origin||!/^\/(?:api|v1|upstream)\//.test(url.pathname)||url.pathname==='/api/diagnostics/events')return this.original(input,init);
  const owner=this.account(),trace=newId(),start=this.now();
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));headers.set('X-Request-ID',trace);
  const fields={trace_id:trace,route:diagnosticRoute(url.pathname),method};
  try{
   const response=await this.original(input,{...init,headers}),duration=this.now()-start;
   if(owner&&(response.status>=400||duration>1500||!['GET','HEAD','OPTIONS'].includes(method)))this.note('client.http',{...fields,status:response.status,duration_ms:duration},owner);
   return response;
  }catch(error){if(owner)this.note('client.http',{...fields,...clientError(error),duration_ms:this.now()-start},owner);throw error}
 };
 close(){this.stopped=true;clearTimeout(this.timer);this.queue=[]}
}

let active:BrowserDiagnostics|undefined;
export function diagnostic(event:string,fields:Fields={}){try{active?.note(event,fields)}catch{/* Diagnostics cannot interrupt the UI. */}}
export function installDiagnostics(){
 if(active)return;
 const original=window.fetch.bind(window);
 const account=()=>{const id=window.storageManager?.currentUser?.id;return id==null?undefined:String(id)};
 const userAgent=navigator.userAgent;
 const browser=/Firefox/i.test(userAgent)?'firefox':/Edg\//.test(userAgent)?'edge':/Chrome/.test(userAgent)?'chrome':/Safari/.test(userAgent)?'safari':'other';
 const platform=/Android/.test(userAgent)?'android':/iPhone|iPad/.test(userAgent)?'ios':/Windows/.test(userAgent)?'windows':/Mac/.test(userAgent)?'macos':'other';
 const build=document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src.split('/').at(-1)?.split('?')[0]||'unknown';
 active=new BrowserDiagnostics(original,account,()=>window.storageManager.getAuthHeaders(),()=>performance.now(),()=>({
  build,browser,platform,width:innerWidth,height:innerHeight,online:navigator.onLine,hidden:document.hidden}));
 window.fetch=active.fetch;
 window.addEventListener('error',(event:Event)=>{
  if(event instanceof ErrorEvent)diagnostic('client.error',clientWindowError(event));
  else diagnostic('client.resource_error',{source:(event.target as HTMLElement|null)?.tagName?.toLowerCase()||'unknown'});
 },true);
 window.addEventListener('unhandledrejection',event=>diagnostic('client.rejection',clientError(event.reason)));
 window.addEventListener('online',()=>diagnostic('client.connection',{state:'browser_online'}));
 window.addEventListener('offline',()=>diagnostic('client.connection',{state:'browser_offline'}));
 document.addEventListener('visibilitychange',()=>{
  diagnostic('client.lifecycle',{state:document.hidden?'hidden':'visible'});
  if(document.hidden)void active?.flush();
 });
 window.addEventListener('pagehide',()=>{diagnostic('client.lifecycle',{state:'pagehide'});void active?.flush()});
 if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
  let last=-Infinity;
  new PerformanceObserver(list=>{
   const tasks=list.getEntries().filter(entry=>entry.duration>=50);
   if(tasks.length&&!document.hidden&&performance.now()-last>10000){
    last=performance.now();diagnostic('client.long_task',{
     duration_ms:Math.max(...tasks.map(entry=>entry.duration)),count:tasks.length,
     state:document.querySelector('.chat-art-generating')?'image':document.querySelector('.live-message')?'stream':'idle'});
   }
  }).observe({type:'longtask',buffered:false});
 }
 diagnostic('client.lifecycle',{state:'started'});
}
