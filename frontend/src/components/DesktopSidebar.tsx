import {accountKey} from '../accountStorage';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {motion} from 'motion/react';
import {motionDuration,motionEasing,softTransition,springTransition} from '../motion';
import {motionProfile} from '../motionProfile';
import {solveSpringSettle,supportsLinearEasing} from '../motionSpring';
import './DesktopSidebar.css';

const storageKey='llamachat_sidebar_width',defaultWidth=287,minWidth=240;
const maxWidth=()=>Math.max(minWidth,Math.min(440,window.innerWidth-440));
const clamp=(width:number)=>Math.round(Math.max(minWidth,Math.min(maxWidth(),width)));

export function DesktopSidebar({open,preview=false,reduced,children}:{open:boolean;preview?:boolean;reduced:boolean|null;children:ReactNode}){
 const [width,setWidth]=useState(()=>{const saved=Number(localStorage.getItem(accountKey(storageKey)));return clamp(Number.isFinite(saved)&&saved>0&&saved!==252?saved:defaultWidth)});
 const [resizing,setResizing]=useState(false),gesture=useRef<{x:number;width:number;pointer:number}|null>(null);
 const surface=useRef<HTMLElement>(null),slot=useRef<HTMLDivElement>(null),previous=useRef({open,width}),slide=useRef<Animation|null>(null);
 // The slot takes its final width at once, so the page is laid out once instead of on every
 // frame. The page then slides as one piece from where it was to where it now is, along the
 // same spring as the panel. An interrupted slide continues from its visible position.
 useLayoutEffect(()=>{
  const before=previous.current;previous.current={open,width};
  const stage=slot.current?.parentElement?.querySelector<HTMLElement>(':scope > .page-stage');
  if(!stage)return;
  // Preference and resize changes can arrive without an open/close change.
  // Stop our native animation before that early return as MotionConfig only
  // controls the panel's React animation, not this page-stage animation.
  if(reduced||resizing){slide.current?.cancel();slide.current=null;return}
  if(before.open===open)return;
  const shown=parseFloat(getComputedStyle(stage).translate)||0;
  slide.current?.cancel();slide.current=null;
  const start=(before.open?before.width:0)+shown-(open?width:0);
  if(Math.abs(start)<.5)return;
  const spring=motionProfile()==='fluid'&&supportsLinearEasing()?solveSpringSettle(Math.abs(start),0,open?31:46):null;
  const animation=stage.animate([{translate:`${start}px 0`},{translate:'0px 0'}],{duration:spring?spring.duration:Math.round((open?motionDuration.surface:motionDuration.exit)*1000),easing:spring?spring.easing:motionEasing});
  animation.id='sidebar-slide';
  slide.current=animation;
  animation.onfinish=animation.oncancel=()=>{if(slide.current===animation)slide.current=null};
 },[open,width,reduced,resizing]);
 useLayoutEffect(()=>()=>{slide.current?.cancel();slide.current=null},[]);
 useLayoutEffect(()=>{
  const app=surface.current?.closest<HTMLElement>('.app');if(!app)return;
  if(resizing)app.dataset.sidebarResizing='true';else delete app.dataset.sidebarResizing;
  return()=>{delete app.dataset.sidebarResizing};
 },[resizing]);
 // Persist the final width, not every pointer sample on the main thread.
 useEffect(()=>{if(!resizing)localStorage.setItem(accountKey(storageKey),String(width))},[width,resizing]);
 useEffect(()=>{const resize=()=>setWidth(current=>clamp(current));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const visible=open||preview;
 return <div ref={slot} className="desktop-sidebar-slot" data-preview={!open&&preview} style={{'--sidebar-width':`${width}px`,width:open?width:0} as CSSProperties}>
 <motion.aside ref={surface} className="desktop-sidebar" data-resizing={resizing} data-preview={!open&&preview} inert={!visible} aria-hidden={!visible} initial={false} animate={{x:visible?0:-width-12,opacity:visible?1:0}} transition={{x:springTransition(reduced||resizing,visible?31:46),opacity:softTransition(reduced||resizing,!open?motionDuration.micro:visible?motionDuration.surface:motionDuration.exit)}}>
  {children}
  <div className="sidebar-resizer" role="separator" aria-label="Ширина меню диалогов" aria-orientation="vertical" aria-valuemin={minWidth} aria-valuemax={maxWidth()} aria-valuenow={width} tabIndex={open?0:-1} aria-description="Потяните, чтобы изменить ширину. Двойной клик — сброс."
   onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();gesture.current={x:event.clientX,width,pointer:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);setResizing(true)}}
   onPointerMove={event=>{const start=gesture.current;if(start&&start.pointer===event.pointerId)setWidth(clamp(start.width+event.clientX-start.x))}}
   onPointerUp={event=>{if(gesture.current?.pointer!==event.pointerId)return;gesture.current=null;setResizing(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
   onPointerCancel={()=>{gesture.current=null;setResizing(false)}} onLostPointerCapture={()=>{gesture.current=null;setResizing(false)}}
   onDoubleClick={()=>setWidth(clamp(defaultWidth))}
   onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();setWidth(current=>clamp(event.key==='Home'?defaultWidth:event.key==='End'?maxWidth():current+(event.key==='ArrowLeft'?-16:16)))}}/>
 </motion.aside></div>;
}
