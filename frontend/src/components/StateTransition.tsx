import type {ReactNode} from 'react';
import {softTransition,motionDuration} from '../motion';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';

function Layer({children,icon}:{children:ReactNode;icon:boolean}){
 const present=useIsPresent(),reduced=useReducedMotion();
 return <motion.span className="state-transition-layer" inert={!present} aria-hidden={!present} style={{position:present?'relative':'absolute',pointerEvents:present?undefined:'none'}}
  initial={icon?{opacity:0}:{opacity:0,y:2}} animate={icon?{opacity:1}:{opacity:1,y:0}} exit={icon?{opacity:0}:{opacity:0,y:-2}}
  transition={softTransition(reduced,present?(icon?motionDuration.detail:motionDuration.micro):motionDuration.exit)}>{children}</motion.span>;
}

/** Animate semantic state changes, while progress updates keep the same layer. */
export function StateTransition({stateKey,children,className=''}:{stateKey:string;children:ReactNode;className?:string}){
 return <span className={`state-transition ${className}`}><AnimatePresence initial={false}><Layer key={stateKey} icon={className.split(' ').includes('is-icon')}>{children}</Layer></AnimatePresence></span>;
}
