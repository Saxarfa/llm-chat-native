import {useEffect,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Loader2,WifiOff} from '../icons';
import type {State} from '../types';

export function ConnectionNotice({connection,onRetry}:{connection:State['connection'];inference?:State['inference'];onRetry:()=>Promise<void>}){
 const kind=connection==='offline'?'sync':null;
 const [long,setLong]=useState(false),[busy,setBusy]=useState(false),reduced=useReducedMotion();
 useEffect(()=>{setLong(false);if(!kind)return;const timer=setTimeout(()=>setLong(true),8000);return()=>clearTimeout(timer)},[kind]);
 const retry=async()=>{if(busy)return;setBusy(true);try{await onRetry()}finally{setBusy(false)}};
 return <AnimatePresence initial={false}>{kind&&<motion.div className="connection-notice" key={kind} initial={{opacity:0,y:-3}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-3}} transition={{duration:reduced?0:.2}}>
  <span role="status"><WifiOff size={12}/>{kind==='sync'?'Восстанавливаем связь…':'Модель недоступна'}</span>
  {long&&<button type="button" disabled={busy} onClick={()=>void retry()} aria-label="Повторить подключение">{busy?<Loader2 size={12} className="spin"/>:'Повторить'}</button>}
 </motion.div>}</AnimatePresence>;
}
