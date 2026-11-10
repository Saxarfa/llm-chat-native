import {useRef} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {fadeTransition,motionEase} from '../motion';

function remaining(seconds:number){
 if(!Number.isFinite(seconds)||seconds<=0)return '';
 if(seconds<60)return `~${Math.max(1,Math.round(seconds))} с`;
 return `~${Math.ceil(seconds/60)} мин`;
}

export function useStudioEta(job?:{id:string;progress?:number}){
 const started=useRef<{id:string;at:number}|undefined>(undefined),progress=job?.progress;
 if(job&&started.current?.id!==job.id)started.current={id:job.id,at:Date.now()};
 const known=typeof progress==='number'&&Number.isFinite(progress),percent=known?Math.max(0,Math.min(100,progress)):0;
 const elapsed=started.current?(Date.now()-started.current.at)/1000:0;
 return {known,percent,eta:known&&percent>=4&&percent<100?remaining(elapsed*(100-percent)/percent):''};
}

export function StudioProgress({job,label=true}:{job?:{id:string;progress?:number};label?:boolean}){
 const reduced=useReducedMotion(),{known,percent,eta}=useStudioEta(job),amount=percent/100;
 return <AnimatePresence>{job&&<motion.div key={job.id} className="studio-generation-progress" aria-hidden="true"
  initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={fadeTransition(reduced,.18)}>
  <div className="studio-progress-track">
   {known?<motion.div className="studio-progress-fill" initial={{scaleX:0}} animate={{scaleX:amount}} transition={{type:'tween',duration:reduced?0:.45,ease:motionEase}}/>:<div className="studio-progress-indeterminate"/>}
  </div>
  {label&&known&&<span className="studio-progress-label">{Math.round(percent)}%{eta&&` · ${eta}`}</span>}
 </motion.div>}</AnimatePresence>;
}
