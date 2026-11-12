type TimingReport={state:string;source:string;duration_ms:number;elapsed_ms:number;count:number};

/** Bounded aggregate timings, not a keystroke log. Never reads text, key names,
 * selection, layout or storage. Frame timings measure a render opportunity,
 * not a guarantee that iOS has presented the pixels on the physical display. */
export function observeComposerInputTiming(field:HTMLInputElement|HTMLTextAreaElement,report:(fields:TimingReport)=>void,sourceOverride?:string){
 const doc=field.ownerDocument,win=doc.defaultView!;
 const source=sourceOverride||(win.matchMedia('(display-mode: standalone)').matches||(win.navigator as Navigator&{standalone?:boolean}).standalone?'composer-pwa':'composer-browser');
 const metrics=new Map<string,{max:number;sum:number;count:number}>();
 let running=false,composing=false,keyAt:number|undefined,beforeAt:number|undefined,beforeEvent:Event|undefined,inputAt:number|undefined,firstFrameAt:number|undefined,inputs=0,windows=0,frame:number|undefined;
 let pulse:number|undefined,batch:number|undefined;
 const now=()=>win.performance.now();
 const sample=(name:string,value:number)=>{
  if(!Number.isFinite(value)||value<0||value>10000)return;
  const item=metrics.get(name)||{max:0,sum:0,count:0};item.max=Math.max(item.max,value);item.sum+=value;item.count++;metrics.set(name,item);
 };
 const flush=()=>{
  if(inputs&&windows<8){
   windows++;
   for(const [name,item] of metrics)report({state:`input_${name}`,source,duration_ms:item.max,elapsed_ms:item.sum/item.count,count:item.count});
  }
  metrics.clear();inputs=0;
 };
 const clearTemporal=()=>{if(frame!==undefined)win.cancelAnimationFrame(frame);frame=undefined;keyAt=beforeAt=inputAt=firstFrameAt=undefined;beforeEvent=undefined};
 const stop=()=>{running=false;composing=false;win.clearTimeout(pulse);win.clearTimeout(batch);pulse=batch=undefined;clearTemporal();flush()};
 const heartbeat=()=>{
  const expected=now()+100;
  pulse=win.setTimeout(()=>{if(!running)return;sample('loop_wait',Math.max(0,now()-expected));heartbeat()},100);
 };
 const publish=()=>{flush();if(windows>=8)stop();else batch=win.setTimeout(publish,15000)};
 const start=()=>{
  if(running||windows>=8||doc.hidden||doc.activeElement!==field)return;
  running=true;heartbeat();batch=win.setTimeout(publish,15000);
 };
 const key=(nativeEvent:Event)=>{
  if(!running)return;
  const event=nativeEvent as KeyboardEvent;
  // A cancelled edit (for example maxlength) has no following input event.
  // It must not be paired with the next keystroke's edit.
  beforeAt=undefined;beforeEvent=undefined;
  keyAt=composing||event.isComposing||event.ctrlKey||event.metaKey||event.altKey?undefined:now();
 };
 const compositionStart=()=>{composing=true;clearTemporal()},compositionEnd=()=>{composing=false;clearTemporal()};
 const beforeInput=(event:InputEvent)=>{
  if(!running)return;
  beforeAt=undefined;beforeEvent=undefined;
  if(composing||event.isComposing){keyAt=undefined;return}
  beforeAt=now();beforeEvent=event;
 };
 const input=(event:Event)=>{
  if(!running)return;
  const time=now();inputs++;sample('dispatch_wait',time-event.timeStamp);
  // Read cancellation at input time: another beforeinput listener can cancel
  // after this passive capture listener has already observed the event.
  if(!beforeEvent?.defaultPrevented){
   if(keyAt!==undefined)sample('key_to_event',time-keyAt);
   if(beforeAt!==undefined){
    if(keyAt!==undefined)sample('key_to_beforeinput',beforeAt-keyAt);
    sample('beforeinput_to_input',time-beforeAt);
   }
  }
  keyAt=beforeAt=undefined;beforeEvent=undefined;
  if(inputAt!==undefined)return;
  inputAt=time;
  frame=win.requestAnimationFrame(()=>{
   firstFrameAt=now();if(inputAt!==undefined)sample('input_to_frame',firstFrameAt-inputAt);
   frame=win.requestAnimationFrame(()=>{
    frame=undefined;const renderedAt=now();
    if(firstFrameAt!==undefined)sample('frame_to_frame',renderedAt-firstFrameAt);
    if(inputAt!==undefined)sample('render_wait',renderedAt-inputAt);
    inputAt=firstFrameAt=undefined;
   });
  });
 };
 const visibility=()=>{if(doc.hidden)stop();else start()};
 field.addEventListener('focus',start);field.addEventListener('blur',stop);
 field.addEventListener('keydown',key,{capture:true,passive:true});
 field.addEventListener('compositionstart',compositionStart);field.addEventListener('compositionend',compositionEnd);
 field.addEventListener('beforeinput',beforeInput as EventListener,{capture:true,passive:true});
 field.addEventListener('input',input,{capture:true,passive:true});
 doc.addEventListener('visibilitychange',visibility);win.addEventListener('pagehide',stop);start();
 return()=>{
  stop();field.removeEventListener('focus',start);field.removeEventListener('blur',stop);field.removeEventListener('keydown',key,true);
  field.removeEventListener('compositionstart',compositionStart);field.removeEventListener('compositionend',compositionEnd);
  field.removeEventListener('beforeinput',beforeInput as EventListener,true);field.removeEventListener('input',input,true);
  doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('pagehide',stop);
 };
}
