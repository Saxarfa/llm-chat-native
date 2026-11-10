import {useSettingsScope} from './SettingsScope';
import type {ReactNode} from 'react';
import {softTransition,motionDuration,motionEase} from '../motion';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';

/** A fractional track follows natural content height without measuring the DOM.
 * Once open, streamed text and responsive wrapping grow immediately; only the
 * actual open/close state animates. Interrupted transitions keep their progress.
 */
export function RevealRegion({children,className='reveal-region',contentClassName,id,role,'aria-label':ariaLabel,duration=motionDuration.detail,onComplete}:{children:ReactNode;className?:string;contentClassName?:string;id?:string;role?:string;'aria-label'?:string;duration?:number;onComplete?:(shown:boolean)=>void}){
 const present=useIsPresent(),reduced=useReducedMotion(),settings=useSettingsScope();
 return <motion.div id={id} role={role} aria-label={ariaLabel} className={className} inert={!present} aria-hidden={!present}
  style={{display:'grid',minWidth:0,pointerEvents:present?undefined:'none'}}
  initial={settings?{opacity:0}:{gridTemplateRows:'0fr',opacity:0}} animate={settings?{opacity:1}:{gridTemplateRows:'1fr',opacity:1}} exit={settings?{opacity:0}:{gridTemplateRows:'0fr',opacity:0}}
  transition={settings?{duration:reduced?0:present?.2:.15,ease:motionEase}:softTransition(reduced,present?duration:motionDuration.exit)} onAnimationComplete={()=>onComplete?.(present)}>
  <div style={{minHeight:0,minWidth:0,overflow:'hidden'}}>{contentClassName?<div className={contentClassName}>{children}</div>:children}</div>
 </motion.div>;
}

/** Newly conditional controls share the same pace as existing disclosures. */
export function Reveal({show,children}:{show:boolean;children:ReactNode}){
 return <AnimatePresence initial={false}>{show&&<RevealRegion key="content">{children}</RevealRegion>}</AnimatePresence>;
}
