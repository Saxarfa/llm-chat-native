/** Native editing owns the text immediately. React observes only whether a
 * sendable draft exists, delivered on the next frame after the input event. */
export function createComposerBuffer(schedule:typeof requestAnimationFrame=requestAnimationFrame,cancel:typeof cancelAnimationFrame=cancelAnimationFrame){
 let text='',present=false,pendingPresence=false,frame:number|undefined,disposed=false;
 const listeners=new Set<()=>void>();
 const deliver=()=>{
  frame=undefined;
  if(disposed||pendingPresence===present)return;
  present=pendingPresence;
  for(const listener of [...listeners]){if(disposed)return;listener()}
 };
 return {
  read:()=>text,
  hasText:()=>present,
  write(next:string){
   if(disposed)return;
   text=next;pendingPresence=!!next.trim();
   if(frame===undefined&&pendingPresence!==present)frame=schedule(deliver);
  },
  subscribe(listener:()=>void){
   if(disposed)return()=>{};
   listeners.add(listener);return()=>{listeners.delete(listener)};
  },
  dispose(){disposed=true;if(frame!==undefined)cancel(frame);frame=undefined;listeners.clear()},
 };
}
