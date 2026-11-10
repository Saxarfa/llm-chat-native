import type {ReactNode} from 'react';
import {motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {softTransition} from '../motion';

export function AttachmentPresence({children}:{children:ReactNode}){
 const present=useIsPresent(),reduced=useReducedMotion();
 return <motion.div className="attachment-presence" inert={!present} aria-hidden={!present}
  initial={{opacity:0,width:0}} animate={{opacity:1,width:'auto',marginRight:0}}
  exit={{opacity:0,width:0,marginRight:-9}} transition={softTransition(reduced)}>
  {children}
 </motion.div>;
}
