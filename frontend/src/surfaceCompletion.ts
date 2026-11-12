/** Wait for a surface's own CSS/WAAPI work, never a guessed duration. A new
 * request cancels the callback without cancelling/restarting the visual motion. */
export function afterSurfaceMotion(element:HTMLElement|null,complete:()=>void){
 let cancelled=false,frame=0;
 const finish=()=>{if(!cancelled)complete()};
 if(!element){queueMicrotask(finish);return()=>{cancelled=true}}
 // State attributes and React style commits must be applied before querying.
 frame=requestAnimationFrame(()=>{
  frame=0;
  if(cancelled)return;
  const animations=element.getAnimations().filter(animation=>{
   const iterations=animation.effect?.getComputedTiming().iterations;
   return iterations!==Infinity&&animation.playState!=='finished';
  });
  if(!animations.length){finish();return}
  void Promise.allSettled(animations.map(animation=>animation.finished)).then(finish);
 });
 return()=>{cancelled=true;cancelAnimationFrame(frame)};
}
