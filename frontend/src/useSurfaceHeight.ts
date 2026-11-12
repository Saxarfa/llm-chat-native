import {useCallback,useLayoutEffect,useRef,useState} from 'react';

/** Size the menu immediately when async results or its detail view change.
 * Measure an intrinsic child so the animation cannot feed back into itself.
 * Surface presence owns motion; interpolating height as well would reflow
 * the list throughout the entrance and make typing/filtering chase a tween.
 * The one exception is opt-in: `animateHeight()` lets the next resize (a tab
 * switch that swaps the whole list) ease to its new height.
 */
export function useSurfaceHeight(open:boolean) {
 const surface=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),animateUntil=useRef(0);
 const animateHeight=useCallback(()=>{animateUntil.current=performance.now()+300},[]);
 const [panel,setPanel]=useState<HTMLDivElement|null>(null);
 // A portalled Radix surface mounts after its owner's layout effect.
 const surfaceRef=useCallback((node:HTMLDivElement|null)=>{surface.current=node;setPanel(node)},[]);
 useLayoutEffect(()=>{
  const inner=body.current;
  if(!open||!panel||!inner)return;
  let lastTarget:number|undefined,frame=0;
  const measure=()=>{
   const styles=getComputedStyle(panel);
   const insets=parseFloat(styles.paddingTop)+parseFloat(styles.paddingBottom)+parseFloat(styles.borderTopWidth)+parseFloat(styles.borderBottomWidth);
   const chrome=`${insets}px`;
   if(panel.style.getPropertyValue('--model-picker-chrome')!==chrome)panel.style.setProperty('--model-picker-chrome',chrome);
   // Layout coordinates stay correct while an ancestor scales or translates.
   const target=inner.offsetHeight+insets;
   if(!Number.isFinite(target)||target<=0||lastTarget!=null&&Math.abs(target-lastTarget)<.5)return;
   const previous=lastTarget;
   lastTarget=target;
   panel.style.height=`${target}px`;
   if(previous!=null&&performance.now()<animateUntil.current&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    animateUntil.current=0;
    panel.animate([{height:`${previous}px`},{height:`${target}px`}],{duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
   }
  };
  measure();
  // Never mutate a measured ancestor during ResizeObserver delivery. This also
  // coalesces font, viewport and async list changes into one retarget per frame.
  const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure()})});observer.observe(inner);
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[open,panel]);
 return {surface,body,surfaceRef,animateHeight};
}
