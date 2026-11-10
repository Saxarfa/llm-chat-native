import {useSettingsScope} from './SettingsScope';
import type {ReactNode} from 'react';
import {motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {softTransition,motionDuration} from '../motion';

export function ListPresence({children,className,section=false,enter=true,chatRow=false}:{children:ReactNode;className?:string;section?:boolean;enter?:boolean;chatRow?:boolean}){
 const settings=useSettingsScope(),present=useIsPresent(),reduced=useReducedMotion(),Tag=section?motion.section:motion.div;
 return <Tag className={className} inert={!present} aria-hidden={!present}
  style={{overflow:present?undefined:'hidden',minHeight:present?undefined:0,pointerEvents:present?undefined:'none'}}
  initial={enter?{opacity:0}:false} animate={settings?{opacity:1}:{opacity:1,height:'auto',x:0}} exit={settings?{opacity:0}:chatRow?{opacity:0,height:0,x:reduced?0:-12,marginTop:0,marginBottom:0}:{opacity:0,height:0}}
  transition={settings?{duration:reduced?0:present?.2:.15,ease:present?'easeOut':'easeOut'}:softTransition(reduced,present?motionDuration.detail:motionDuration.exit)}>{children}</Tag>;
}
