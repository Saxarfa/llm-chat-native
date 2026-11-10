import {useSettingsScope} from './SettingsScope';
import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {animate,motion,useMotionValue} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {springTransition} from '../motion';

type Bounds={x:number;y:number;width:number;height:number};
type Placement={bounds:Bounds;animate:boolean};
const sameBounds=(a:Bounds,b:Bounds)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height;

/** Keep one persistent highlight in the group's own coordinate system.
 * Shared layout projection uses screen coordinates; an animating/scaled modal
 * can invalidate those coordinates and send its highlight outside the tabs.
 */
export function SelectionHighlight({container,activeKey,className}:{container:RefObject<HTMLElement|null>;activeKey:string;className:string}) {
 const reduced=useReducedMotion(),settings=useSettingsScope();
 const [placement,setPlacement]=useState<Placement|null>(null),measureCurrent=useRef<(animate:boolean)=>void>(()=>{}),highlight=useRef<HTMLSpanElement>(null);
 const x=useMotionValue(0),y=useMotionValue(0),width=useMotionValue(0),height=useMotionValue(0);
 useLayoutEffect(()=>{
  // A child's layout effect can run before its parent's ref is attached.
  // Our own marker is already mounted, so it provides the same local group.
  const group=container.current||highlight.current?.parentElement;if(!group)return;
  const measure=(animate=false)=>{
   const button=group.querySelector<HTMLElement>(':scope>button:is([aria-selected=true],[aria-pressed=true],[aria-current=page])');
   if(!button||!button.offsetWidth||!button.offsetHeight){setPlacement(old=>old===null?old:null);return}
   const next={x:button.offsetLeft,y:button.offsetTop,width:button.offsetWidth,height:button.offsetHeight};
   setPlacement(old=>old&&sameBounds(old.bounds,next)?old:{bounds:next,animate});
  };
  measureCurrent.current=measure;
  measure();
  let frame=0;
  // Resize/font changes must follow their controls, rather than lagging behind
  // a responsive layout for a full selection transition. Batch layout reads.
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure()})};
  const observer=new ResizeObserver(schedule),observed=new Set<Element>();
  observer.observe(group);
  const observeButtons=()=>{
   const buttons=new Set(group.querySelectorAll(':scope>button'));
   observed.forEach(button=>{if(!buttons.has(button)){observer.unobserve(button);observed.delete(button)}});
   buttons.forEach(button=>{if(!observed.has(button)){observer.observe(button);observed.add(button)}});
   schedule();
  };
  observeButtons();
  const children=new MutationObserver(observeButtons);children.observe(group,{childList:true});
  window.addEventListener('resize',schedule);
  document.fonts?.addEventListener('loadingdone',schedule);
  return()=>{measureCurrent.current=()=>{};cancelAnimationFrame(frame);observer.disconnect();children.disconnect();window.removeEventListener('resize',schedule);document.fonts?.removeEventListener('loadingdone',schedule)};
 },[container]);
 useLayoutEffect(()=>measureCurrent.current(true),[activeKey]);
 useLayoutEffect(()=>{
  if(!placement)return;
  const controls=Object.entries({x,y,width,height}).map(([key,value])=>{
   const target=placement.bounds[key as keyof Bounds];
   // Lay out the marker once; only its position glides between controls.
   if(reduced||!placement.animate||key==='width'||key==='height'){value.stop();value.set(target);return}
   return animate(value,target,settings?{duration:.2,ease:'easeOut'}:springTransition(false,40,.22));
  });
  return()=>controls.forEach(control=>control?.stop());
 },[placement,reduced,settings,x,y,width,height]);
 return <motion.span ref={highlight} className={`selection-highlight ${className}`} data-active={placement?'true':undefined} aria-hidden="true" style={{x,y,width,height,visibility:placement?undefined:'hidden'}}/>;
}
