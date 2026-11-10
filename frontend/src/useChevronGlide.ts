import {useLayoutEffect,useRef,type RefObject} from 'react';
import {motionEasing} from './motion';
import {useReducedMotion} from './useReducedMotion';

/** When the title beside a disclosure chevron changes width, the chevron glides
 * to its new place instead of jumping. `translate` is separate from the rotation
 * `transform`, so the two never fight. Resizes of the window are ignored. */
export function useChevronGlide(ref:RefObject<Element|null>,duration=200){
 const reduced=useReducedMotion(),last=useRef<{left:number;width:number}>(undefined),animation=useRef<Animation>(undefined);
 useLayoutEffect(()=>{
  const element=ref.current as HTMLElement|null;if(!element)return;
  animation.current?.cancel();animation.current=undefined;
  const left=element.offsetLeft,width=window.innerWidth,previous=last.current;last.current={left,width};
  if(!previous||previous.width!==width||reduced||typeof element.animate!=='function')return;
  const delta=previous.left-left;if(Math.abs(delta)<.5||Math.abs(delta)>240)return;
  const run=element.animate([{translate:`${delta}px 0`},{translate:'0 0'}],{duration,easing:motionEasing});
  animation.current=run;run.onfinish=()=>{if(animation.current===run)animation.current=undefined};
 });
 useLayoutEffect(()=>()=>animation.current?.cancel(),[]);
}
