import {useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Check,Loader2,Mic,X} from '../icons';
import {IconButton} from './primitives';
import {DICTATION_SECONDS,DictationCapture,microphoneError} from '../dictation';
import {triggerHaptic} from '../haptics';
import {failure} from '../store';
import {softTransition} from '../motion';
import './Dictation.css';

type Mode='idle'|'permission'|'recording'|'processing';
export function Dictation({onText,onActiveChange,overlayRoot,disabled=false}:{onText:(text:string)=>void;onActiveChange:(active:boolean)=>void;overlayRoot:RefObject<HTMLElement|null>;disabled?:boolean}){
 const[mode,setMode]=useState<Mode>('idle'),[elapsed,setElapsed]=useState(0),reduced=useReducedMotion();
 const capture=useRef<DictationCapture|undefined>(undefined),upload=useRef<AbortController|undefined>(undefined),session=useRef(0),canvas=useRef<HTMLCanvasElement>(null),limit=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const callbacks=useRef({onText,onActiveChange});callbacks.current={onText,onActiveChange};
 const clearLimit=()=>{clearTimeout(limit.current);limit.current=undefined};
 const idle=()=>{clearLimit();capture.current?.cancel();capture.current=undefined;upload.current?.abort();upload.current=undefined;setMode('idle');callbacks.current.onActiveChange(false)};
 const cancel=()=>{triggerHaptic('mic_stop');session.current++;idle()};
 useEffect(()=>()=>{session.current++;clearLimit();capture.current?.cancel();upload.current?.abort();callbacks.current.onActiveChange(false)},[]);
 useEffect(()=>{if(disabled&&mode!=='idle')cancel()},[disabled,mode]);
 const finish=async()=>{
  const recording=capture.current;if(!recording||upload.current)return;
  triggerHaptic('mic_stop');
  const id=session.current;clearLimit();setMode('processing');
  const controller=new AbortController();upload.current=controller;
  try{
   const audio=await recording.stop();if(id!==session.current)return;
   const response=await fetch('/api/speech/transcribe',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':audio.type.split(';')[0]},body:audio,signal:controller.signal});
   const result=await response.json().catch(()=>({}));if(id!==session.current)return;
   if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Не удалось распознать запись. Попробуй ещё раз.');
   if(typeof result.text!=='string'||!result.text.trim())throw new Error('Не удалось услышать речь. Попробуй ещё раз.');
   callbacks.current.onText(result.text);
  }catch(error){if(id===session.current&&!(error instanceof DOMException&&error.name==='AbortError'))failure(error instanceof TypeError?'Не удалось связаться с сервером диктовки. Проверь соединение и попробуй снова.':error)}finally{if(id===session.current)idle()}
 };
 const start=async()=>{
  if(disabled||mode!=='idle')return;
  triggerHaptic('mic_start');
  if(!window.isSecureContext&&!window.__IS_LLM_NATIVE_IOS__){failure('Для микрофона открой сайт по HTTPS. На телефоне используй HTTPS-адрес через Tailscale.');return}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){failure('Этот браузер не поддерживает запись с микрофона. Открой сайт в Safari или Chrome.');return}
  const id=++session.current;setElapsed(0);setMode('permission');callbacks.current.onActiveChange(true);
  const recording=new DictationCapture(error=>{if(id===session.current){failure(error);cancel()}});capture.current=recording;
  try{
   if(!await recording.start()||id!==session.current)return;
   setMode('recording');limit.current=setTimeout(()=>void finish(),(DICTATION_SECONDS-.5)*1000);
  }catch(error){if(id===session.current){failure(microphoneError(error));idle()}}
 };
 useEffect(()=>{
  if(mode!=='recording')return;
  const start=performance.now(),timer=setInterval(()=>setElapsed(Math.min(DICTATION_SECONDS,Math.floor((performance.now()-start)/1000))),250);
  let frame=0,smoothedLevel=0;
  const draw=()=>{
   const node=canvas.current,ctx=node?.getContext('2d');
   if(node&&ctx){const dpr=Math.min(devicePixelRatio||1,2),width=node.clientWidth,height=node.clientHeight;
    if(node.width!==width*dpr||node.height!==height*dpr){node.width=width*dpr;node.height=height*dpr}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle=getComputedStyle(node).getPropertyValue('--dictation-wave').trim()||'#d9ccb0';
    const target=capture.current?.level()||0;smoothedLevel+=(target-smoothedLevel)*.18;const level=smoothedLevel,count=Math.floor(width/5),time=reduced?0:(performance.now()-start)/220;
    for(let i=0;i<count;i++){const envelope=.25+.75*Math.sin(Math.PI*(i+1)/(count+1)),bar=3+level*(height-5)*envelope*(.45+.55*Math.sin(time+i*.55)**2);ctx.beginPath();ctx.roundRect(i*5,(height-bar)/2,2.5,bar,2);ctx.fill()}
   }frame=requestAnimationFrame(draw);
  };draw();return()=>{clearInterval(timer);cancelAnimationFrame(frame)};
 },[mode,reduced]);
 useEffect(()=>{if(mode==='idle')return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();cancel()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[mode]);
 useEffect(()=>{if(mode==='idle')return;const hidden=()=>{if(document.hidden)cancel()};const leaving=()=>cancel();document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leaving);return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leaving)}},[mode]);
 return <><IconButton label="Диктовать сообщение" className="dictation-trigger" disabled={disabled||mode!=='idle'} onClick={()=>void start()}><Mic size={18} data-recording={mode==='recording'}/></IconButton>{overlayRoot.current&&createPortal(<AnimatePresence>{mode!=='idle'&&<motion.div className="dictation-overlay" data-mode={mode} initial={{opacity:0,y:3}} animate={{opacity:1,y:0}} exit={{opacity:0,y:2}} transition={softTransition(reduced)}>
  <motion.div key={mode} className="dictation-status" initial={{opacity:0}} animate={{opacity:1}} transition={softTransition(reduced)}>{mode==='recording'?<><span className="dictation-mic" aria-hidden="true"><Mic size={16} data-icon-motion="off"/><span className="dictation-dot"/></span><span className="dictation-caption"><span className="dictation-listening" role="status">Слушаю</span><span className="dictation-time" aria-hidden="true">{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</span></span><canvas ref={canvas} className="dictation-wave" aria-hidden="true"/></>:<><span className="dictation-mic" aria-hidden="true"><Loader2 size={16} className="spin"/></span><span role="status">{mode==='permission'?'Включаю микрофон…':'Распознаю речь…'}</span></>}</motion.div>
  <div className="dictation-actions"><IconButton label="Отменить диктовку" onClick={cancel}><X size={18}/></IconButton>{<IconButton disabled={mode!=='recording'} label="Завершить диктовку" className="dictation-confirm" onClick={()=>void finish()}><Check size={20}/></IconButton>}</div>
 </motion.div>}</AnimatePresence>,overlayRoot.current)}</>;
}
