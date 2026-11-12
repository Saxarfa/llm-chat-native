import {useEffect,useId,useRef} from 'react';
import {useReducedMotion} from '../useReducedMotion';
import {statsScrollPosition} from '../statsScroll';

type Session={scroll:HTMLElement;mode:'bottom'|'reveal'|'restore';opening:boolean;gap:number;height:number;startHeight:number;remaining:number;startTop:number;cleanup:()=>void};
export function useStatsScroll() {
 const root=useRef<HTMLDivElement>(null),session=useRef<Session|null>(null),id=useId(),reduced=useReducedMotion(),finishFrame=useRef(0);
 const revealed=useRef<{scroll:HTMLElement;shift:number;top:number}|null>(null);
 const stop=()=>{const current=session.current;if(!current)return;current.cleanup();if(current.scroll.dataset.statsAnimating===id)delete current.scroll.dataset.statsAnimating;session.current=null};
 const begin=(opening:boolean)=>{
  cancelAnimationFrame(finishFrame.current);stop();
  const element=root.current,scroll=element?.closest<HTMLElement>('.message-scroll');
  if(!element||!scroll||reduced)return;
  const gap=Math.max(0,scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop),saved=revealed.current;
  const restore=!opening&&saved?.scroll===scroll&&Math.abs(saved.top-scroll.scrollTop)<3&&saved.shift>0;
  const mode=gap<100?'bottom':opening?'reveal':restore?'restore':null;
  if(!mode)return;
  // Stop touch inertia once; thereafter follow the actual animated height.
  scroll.scrollTo({top:scroll.scrollTop,behavior:'instant'});
  const cancel=()=>{revealed.current=null;stop()};
  const events=['touchstart','pointerdown','wheel'] as const;
  events.forEach(event=>scroll.addEventListener(event,cancel,{passive:true}));
  session.current={scroll,mode,opening,gap,height:element.getBoundingClientRect().height,startHeight:element.getBoundingClientRect().height,remaining:restore?saved!.shift:0,startTop:scroll.scrollTop,cleanup:()=>events.forEach(event=>scroll.removeEventListener(event,cancel))};
  scroll.dataset.statsAnimating=id;
 };
 const finish=()=>{
  cancelAnimationFrame(finishFrame.current);
  finishFrame.current=requestAnimationFrame(()=>{const current=session.current;if(current?.scroll.dataset.statsAnimating===id){if(current.opening&&current.mode==='reveal')revealed.current={scroll:current.scroll,shift:Math.max(0,current.scroll.scrollTop-current.startTop),top:current.scroll.scrollTop};else revealed.current=null}stop()});
 };
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const observer=new ResizeObserver(()=>{
   const current=session.current;if(!current||current.scroll.dataset.statsAnimating!==id)return;
   const rect=element.getBoundingClientRect(),height=rect.height,delta=height-current.height;
   current.height=height;if(Math.abs(delta)<.01)return;
   const scroll=current.scroll,view=scroll.getBoundingClientRect(),clip=element.querySelector<HTMLElement>('.stats-details');
   const baseHeight=height-(clip?.getBoundingClientRect().height||0),fullHeight=baseHeight+(clip?.firstElementChild?.scrollHeight||0);
   const progress=current.opening?(height-current.startHeight)/Math.max(1,fullHeight-current.startHeight):(current.startHeight-height)/Math.max(1,current.startHeight-baseHeight);
   const gap=current.gap*(1-Math.max(0,Math.min(1,progress)));
   const next=statsScrollPosition({mode:current.mode,top:scroll.scrollTop,max:Math.max(0,scroll.scrollHeight-scroll.clientHeight),gap,overflow:rect.bottom-view.bottom+12,delta,remaining:current.remaining});
   current.remaining=next.remaining;
   if(Math.abs(scroll.scrollTop-next.top)>.25)scroll.scrollTo({top:next.top,behavior:'instant'});
  });
  observer.observe(element);return()=>{observer.disconnect();cancelAnimationFrame(finishFrame.current);stop()};
 },[id]);
 return {root,begin,finish};
}
