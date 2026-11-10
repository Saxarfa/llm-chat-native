import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {observedHeight} from '../observedHeight';
import {motionDuration,softTransition} from '../motion';
import {afterSurfaceMotion} from '../surfaceCompletion';

function VariantLayer({children}:{children:ReactNode}){
 const present=useIsPresent(),reduced=useReducedMotion();
 return <motion.div className="variant-layer" aria-hidden={!present} inert={!present}
  style={present?undefined:{position:'absolute',inset:'0 0 auto'}}
  initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}
  exit={{opacity:0,y:-3,transition:{duration:reduced?0:.12}}}
  transition={softTransition(reduced,motionDuration.surface)}>{children}</motion.div>;
}

// Animate only a saved variant change. Streaming and normal content resizing stay immediate.
export function VariantTransition({variantKey,live,children}:{variantKey:string;live:boolean;children:ReactNode}){
 const reduced=useReducedMotion(),inner=useRef<HTMLDivElement>(null),outer=useRef<HTMLDivElement>(null),previous=useRef(variantKey);
 const[height,setHeight]=useState<number>(),[changing,setChanging]=useState(false);
 const measured=useRef<number>(undefined),animating=useRef(false);
 const settle=()=>{
  if(!animating.current||!outer.current||!inner.current||Math.abs(outer.current.getBoundingClientRect().height-inner.current.getBoundingClientRect().height)>1)return;
  animating.current=false;setChanging(false);
 };
 useLayoutEffect(()=>{
  if(reduced||live){previous.current=variantKey;animating.current=false;setChanging(false);setHeight(undefined);return}
  if(previous.current!==variantKey){
   previous.current=variantKey;
   animating.current=!live&&!reduced;setChanging(animating.current);
   if(animating.current)setHeight(measured.current);
  }
 },[variantKey,live,reduced]);
 useLayoutEffect(()=>{
  const element=inner.current;if(!element)return;
  const observer=new ResizeObserver(entries=>{const entry=entries[0];if(!entry)return;const next=observedHeight(entry);measured.current=next;if(animating.current)setHeight(old=>old==null||Math.abs(old-next)>.5?next:old)});observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 useLayoutEffect(()=>{
  if(!changing)return;
  return afterSurfaceMotion(outer.current,settle);
 },[changing,height,variantKey]);
 return <motion.div ref={outer} className={`variant-transition ${changing?'variant-changing':''}`} initial={false} onAnimationComplete={settle}
  animate={{height:changing&&!live&&!reduced?height??'auto':'auto'}} transition={softTransition(reduced||!changing||live,motionDuration.surface)}>
  <div ref={inner} className="variant-buffer"><AnimatePresence initial={false}>
   <VariantLayer key={variantKey}>{children}</VariantLayer>
  </AnimatePresence></div>
 </motion.div>;
}
