import {useLayoutEffect,useMemo,useRef} from 'react';
import {useReducedMotion} from '../useReducedMotion';
import {ReasoningWords} from '../reasoningWords';

export function ReasoningText({text,active,restored=false}:{text:string;active:boolean;restored?:boolean}){
 const words=useRef(new ReasoningWords()),parts=useMemo(()=>words.current.update(text),[text]);
 const reduced=useReducedMotion(),box=useRef<HTMLDivElement>(null),seed=useRef({text,count:parts.length});
 const following=useRef(active),frame=useRef(0),lastTop=useRef(0),touchY=useRef<number|undefined>(undefined),wasActive=useRef(active);
 const appending=text.startsWith(seed.current.text);
 // Keep the settled history as plain text; only the recent tail needs animation nodes.
 const firstAnimated=active&&!restored&&!reduced&&appending?Math.max(seed.current.count,parts.length-80):parts.length;
 const pause=()=>{following.current=false;cancelAnimationFrame(frame.current);frame.current=0};
 useLayoutEffect(()=>{
  if(active&&!wasActive.current)following.current=true;wasActive.current=active;
  if(!appending)seed.current={text,count:parts.length};
  const element=box.current;if(!element||!active||!following.current){if(!active){cancelAnimationFrame(frame.current);frame.current=0}return}
  if(reduced){element.scrollTop=element.scrollHeight;lastTop.current=element.scrollTop;return}
  if(frame.current)return;
  let previous=performance.now();
  const tick=(now:number)=>{
   if(!following.current){frame.current=0;return}
   const target=Math.max(0,element.scrollHeight-element.clientHeight),dt=Math.min(50,now-previous);previous=now;
   const before=element.scrollTop,next=before+(target-before)*(1-Math.exp(-dt/75));
   element.scrollTop=Math.abs(target-next)<.75?target:next;lastTop.current=element.scrollTop;
   if(Math.abs(target-element.scrollTop)>.75&&Math.abs(element.scrollTop-before)>.1)frame.current=requestAnimationFrame(tick);else frame.current=0;
  };
  frame.current=requestAnimationFrame(tick);
 },[text,active,reduced,appending,parts.length]);
 useLayoutEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 return <div ref={box} className="reasoning-text" onWheel={event=>{if(event.deltaY<0)pause()}}
  onTouchStart={event=>{touchY.current=event.touches[0]?.clientY}}
  onTouchMove={event=>{const y=event.touches[0]?.clientY;if(y!=null&&touchY.current!=null&&y>touchY.current+3)pause();touchY.current=y}}
  onScroll={()=>{const element=box.current;if(!element)return;const top=element.scrollTop,down=top>lastTop.current+.5;if(top<lastTop.current-.5)pause();if(down&&element.scrollHeight-top-element.clientHeight<=12)following.current=true;lastTop.current=top}}>
  <span>{text.slice(0,parts[firstAnimated]?.start??text.length)}</span>{parts.slice(firstAnimated).map((part,index)=><span key={firstAnimated+index} className={!/^\s+$/u.test(part.text)?'reasoning-word-enter':undefined}>{part.text}</span>)}
 </div>;
}
