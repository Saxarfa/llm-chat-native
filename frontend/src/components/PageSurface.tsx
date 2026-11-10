import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {softTransition,motionDuration} from '../motion';
import {motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';

/** A prepared page participates in layout but stays invisible/inert until its
 * data and initial geometry are ready. Only this shell animates page presence. */
export function PageSurface({active,ready=true,prepare=false,keepMounted=false,name,onPresented,children}:{active:boolean;ready?:boolean;prepare?:boolean;keepMounted?:boolean;name:string;onPresented?:()=>void;children:ReactNode}){
 const shown=active&&ready,reduced=useReducedMotion(),[retained,setRetained]=useState(shown),current=useRef(shown),presented=useRef(false),complete=useRef(onPresented);
 current.current=shown;complete.current=onPresented;
 if(!shown)presented.current=false;
 useLayoutEffect(()=>{if(shown)setRetained(true);else if(reduced)setRetained(false)},[shown,reduced]);
 if(!shown&&!retained&&!prepare&&!keepMounted)return null;
 return <motion.div className="page-surface" data-page={name} data-surface-phase={shown?'shown':prepare?'preparing':retained?'exiting':'idle'} hidden={!shown&&!retained&&!prepare} inert={!shown} aria-hidden={!shown}
  style={{zIndex:shown?2:1,pointerEvents:shown?'auto':'none',visibility:prepare&&!shown&&!retained?'hidden':undefined}} initial={false}
  animate={{opacity:shown?1:0}} transition={softTransition(reduced,shown?motionDuration.detail:motionDuration.exit)}
  onAnimationComplete={()=>{if(!current.current)setRetained(false);else if(!presented.current){presented.current=true;complete.current?.()}}}>{children}</motion.div>;
}
