import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AnimatePresence} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Disclosure} from './primitives';
import {ReasoningText} from './ReasoningText';
import {ActivityIndicator} from './ActivityIndicator';
import {responseStatus} from '../responseStatus';
import type {Live,Message} from '../types';
import {observedHeight} from '../observedHeight';
import {MessageEntrance} from './MessageEntrance';

function ReasoningTitle({thinking,duration}:{thinking:boolean;duration?:number}){
 return <ActivityIndicator kind="thinking" state={thinking?'running':'completed'} label={thinking?'Думаю…':'Рассуждения'} identity={thinking?'thinking':'finished'} meta={!thinking&&duration?`${duration} с`:undefined}/>;
}

export function ResponseActivity({message,live,loading}:{message:Message;live?:Live;loading:boolean}){
 const mounted=useRef(false);useLayoutEffect(()=>{mounted.current=true},[]);
 const reduced=useReducedMotion(),inner=useRef<HTMLDivElement>(null),[height,setHeight]=useState<number>(),[freeHeight,setFreeHeight]=useState(false),reasoningOpen=useRef(false);
 const reasoning=!!message.reasoning||!!live?.is_thinking;
 const activity=responseStatus(message,live),phase=activity?.phase;
 useLayoutEffect(()=>{
  const element=inner.current;if(!element)return;
  let frame=0;const observer=new ResizeObserver(entries=>{const entry=entries[0];if(!entry)return;const next=observedHeight(entry);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;setHeight(previous=>previous==null||Math.abs(previous-next)>.5?next:previous)})});
  observer.observe(element);return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[]);
 useEffect(()=>{if(!reasoning){reasoningOpen.current=false;setFreeHeight(false)}},[reasoning]);
 const disclosureChanged=(open:boolean)=>{
  reasoningOpen.current=open;setFreeHeight(true);
  // The disclosure owns its expansion animation; don't animate the same height twice.
 };
 // Switching to natural height must be immediate: interpolating to `auto` here
 // would lag behind the disclosure's own animation and overlap the answer below.
 // Native height transitions don't schedule JS writes on every frame. `auto`
 // during a disclosure is a real layout value, with no second interpolator.
 return <div className="response-activity" style={{height:freeHeight?'auto':height,transition:freeHeight||reduced?'none':'height 220ms cubic-bezier(.23,1,.32,1)'}}>
  <div ref={inner} className="activity-content"><AnimatePresence initial={false} mode="popLayout">
   {reasoning&&<MessageEntrance className="activity-phase" key="reasoning" enter={mounted.current&&!!live&&!live.restored}>
    <Disclosure busy={activity?.thinking} className="reasoning" onOpenChange={disclosureChanged} onTransitionComplete={open=>{if(!open&&!reasoningOpen.current)setFreeHeight(false)}} title={<ReasoningTitle thinking={!!activity?.thinking} duration={message.thinkingDuration}/>}>
     <ReasoningText text={message.reasoning||'Модель обрабатывает запрос…'} active={!!live&&!live.stopping} restored={live?.restored}/>
    </Disclosure>
   </MessageEntrance>}
   {phase&&<MessageEntrance className="activity-phase" key="waiting" enter={mounted.current&&!!live&&!live.restored}>
    <div className={`waiting-response activity-surface waiting-compact ${loading?'model-loading':''}`}>
     <div className="waiting-copy"><ActivityIndicator className="waiting-phase" {...phase} identity={phase.label}/></div>
    </div>
   </MessageEntrance>}
  </AnimatePresence></div>
 </div>;
}
