import {useCallback,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Ghost,X} from '../icons';
import {IconButton} from './primitives';
import {endTemporaryChat} from '../store';

import {motionEase as ease,motionDuration,softTransition} from '../motion';
type SurfaceProps={temporary:boolean;empty:boolean;reduced:boolean|null;className:string;children:ReactNode};

// App coordinates composer geometry for every mode. This persistent shell only
// exposes the mode; the header and welcome below own their own presence.
export function TemporaryChatSurface({temporary,className,children}:SurfaceProps){
 return <main className={className} data-temporary={temporary}>{children}</main>;
}

export function TemporaryBadge(){
 const reduced=useReducedMotion(),present=useIsPresent();
 return <motion.div className="temporary-chat-badge" inert={!present} aria-hidden={!present} initial={{width:0,opacity:0}} animate={{width:'auto',opacity:1}} exit={{width:0,opacity:0}}
  transition={{width:{duration:reduced?0:.24,ease},opacity:{duration:reduced?0:.16}}}>
  <Ghost size={16}/><span>Временный чат</span><IconButton label="Завершить временный чат" onClick={()=>void endTemporaryChat()}><X size={14}/></IconButton>
 </motion.div>;
}

export function ModeHeaderControl({children}:{children:ReactNode}){
 const reduced=useReducedMotion(),present=useIsPresent();
 return <motion.div className="mode-header-control" inert={!present} aria-hidden={!present} initial={{width:0,opacity:0}} animate={{width:'auto',opacity:1}} exit={{width:0,opacity:0}}
  transition={{width:{duration:reduced?0:.24,ease},opacity:{duration:reduced?0:.14}}}>{children}</motion.div>;
}

function WelcomeLayer({temporary,children,onHeight}:{temporary:boolean;children:ReactNode;onHeight:(height:number)=>void}){
 const reduced=useReducedMotion(),present=useIsPresent();
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node||!present)return;
  // Measure intrinsic layout, not the translated/zoomed viewport rectangle.
  let frame=0;const measure=()=>onHeight(node.offsetHeight);
  measure();const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure()})});observer.observe(node);
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[present,onHeight]);
 return <motion.div ref={ref} className="mode-welcome" inert={!present} aria-hidden={!present} initial={{opacity:0,y:reduced?0:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-3,pointerEvents:'none',transition:softTransition(reduced,motionDuration.exit)}} transition={softTransition(reduced,motionDuration.surface)}>
  {temporary?<div className="temporary-welcome"><Ghost size={32}/><h1>Разговор без истории</h1></div>:children}
 </motion.div>;
}

export function ModeWelcome({temporary,children}:{temporary:boolean;children:ReactNode}){
 const reduced=useReducedMotion(),[height,setHeight]=useState<number>();
 const measure=useCallback((next:number)=>setHeight(previous=>previous===next?previous:next),[]);
 // Keep the outgoing height until its fade ends. The incoming title then owns
 // one coordinated height/fade transition, without collapsing the composer.
 return <motion.div className="mode-welcome-stage" initial={false} animate={{height:height??'auto'}} transition={softTransition(reduced,motionDuration.surface)}>
  <AnimatePresence initial={false} mode="wait" propagate><WelcomeLayer key={temporary?'temporary':'regular'} temporary={temporary} onHeight={measure}>{children}</WelcomeLayer></AnimatePresence>
 </motion.div>;
}
