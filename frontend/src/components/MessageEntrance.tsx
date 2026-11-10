import {forwardRef,useImperativeHandle,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {motion,useIsPresent} from 'motion/react';
import {motionEasing} from '../motion';
import {useReducedMotion} from '../useReducedMotion';

/** A single native timeline for both properties: no per-frame JS style writes. */
export function useMessageEntrance(ref:RefObject<HTMLElement|null>,active:boolean,reduced:boolean,distance:number,duration=280,onComplete?:()=>void){
 const complete=useRef(onComplete);complete.current=onComplete;
 useLayoutEffect(()=>{
  const element=ref.current;if(!element||!active)return;
  if(reduced||typeof element.animate!=='function'){complete.current?.();return}
  let cancelled=false;
  const animation=element.animate([
   {opacity:0,transform:`translate3d(0,${distance}px,0)`},
   {opacity:1,transform:'none'},
  ],{duration,easing:motionEasing,fill:'backwards'});
  void animation.finished.then(()=>{
   if(cancelled)return;
   animation.cancel();complete.current?.();
  },()=>{});
  return()=>{cancelled=true;animation.cancel()};
 },[ref,active,reduced,distance,duration]);
}

/** Presence still owns removal; the browser owns entrance interpolation. */
type EntranceProps={children:ReactNode;className:string;enter:boolean;distance?:number;inline?:boolean};
export const MessageEntrance=forwardRef<HTMLElement,EntranceProps>(function MessageEntrance({children,className,enter,distance=4,inline=false},forwardedRef){
 const ref=useRef<HTMLDivElement>(null),reduced=useReducedMotion(),present=useIsPresent();
 // popLayout needs the actual DOM node to position an exiting status/caption.
 useImperativeHandle(forwardedRef,()=>ref.current!,[]);
 // A later token or stream completion must never restart this mounted block.
 const [initialEnter]=useState(enter);
 useMessageEntrance(ref,initialEnter&&present,reduced,distance,220);
 const Tag=inline?motion.span:motion.div;
 return <Tag ref={ref} className={className} inert={!present} aria-hidden={!present||undefined} initial={false} exit={{opacity:0}} transition={{duration:reduced?0:.18}}>{children}</Tag>;
});
