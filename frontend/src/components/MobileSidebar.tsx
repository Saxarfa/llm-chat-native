import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {sidebarDragOffset,shouldFinishSidebarDrag} from '../gestures';
import {triggerHaptic} from '../haptics';
import {motionDuration,motionEasing} from '../motion';
import {motionProfile} from '../motionProfile';
import {startMotionProbe,type MotionProbe} from '../motionProbe';
import {solveSpringSettle,supportsLinearEasing} from '../motionSpring';
import './MobileSidebar.css';

type Drag={id:number;x:number;y:number;dx:number;opening:boolean;interrupted:boolean;origin:number;width:number;offset:number;dragging:boolean;crossed?:boolean;target:HTMLElement;samples:{x:number;at:number}[]};
type Updater=boolean|((prev:boolean)=>boolean);
const listeners=new Set<(value:Updater,animate:boolean)=>void>();
export function setMobileSidebarOpen(value:Updater,animate=true){listeners.forEach(listener=>listener(value,animate))}

// A release keeps the finger's speed; a tap or button press starts from rest.
// Critically damped, so the screen never travels past either edge.
const classicSettle={open:{duration:Math.round(motionDuration.surface*1000),easing:motionEasing},close:{duration:Math.round(motionDuration.exit*1000),easing:motionEasing}};
// Depth: the menu waits a little to the left and dimmed, and settles into place as the screen slides away.
// Both follow the screen's position, so they share its timeline and move only by transform/opacity.
const parallaxShift=24;
// One live query for every drag sample: matchMedia() builds a new object per call.
const reducedMotionQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion:reduce)'):null;
function depthAt(x:number,width=document.documentElement.clientWidth||1){
 if(motionProfile()==='classic')return null;
 const open=Math.min(1,Math.max(0,x/width));
 return{shift:reducedMotionQuery?.matches?0:-(1-open)*parallaxShift,shade:1-open};
}
function settleOptions(next:boolean,distance:number,velocity:number){
 if(motionProfile()==='classic'||!supportsLinearEasing())return next?classicSettle.open:classicSettle.close;
 const {duration,easing}=solveSpringSettle(distance,velocity,next?31:46);
 return{duration,easing};
}

export function MobileSidebar({open:controlledOpen,onOpen,onClose,children}:{open?:boolean;onOpen?:()=>void;onClose?:()=>void;children:ReactNode}){
 const [mounted,setMounted]=useState(Boolean(controlledOpen));
 const openRef=useRef(Boolean(controlledOpen));
 const host=useRef<HTMLDivElement>(null),drawer=useRef<HTMLDivElement>(null),cover=useRef<HTMLDivElement>(null),edgeRef=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),dim=useRef<HTMLDivElement>(null);
 const foreground=useRef<HTMLElement|null>(null),gesture=useRef<Drag|null>(null),opener=useRef<HTMLElement|null>(null),keyboardTrigger=useRef(false);
 const animations=useRef<Animation[]>([]),suppressedUntil=useRef(0),probe=useRef<MotionProbe|null>(null);
 const stopMotion=()=>{animations.current.forEach(animation=>{animation.onfinish=null;animation.cancel()});animations.current=[]};
 const position=(x:number,width?:number)=>{
  for(const element of [foreground.current,cover.current])if(element)element.style.translate=`${x}px 0`;
  const depth=depthAt(x,width);
  if(depth&&content.current&&dim.current){content.current.style.translate=`${depth.shift}px 0`;dim.current.style.opacity=String(depth.shade)}
 };
 const prepare=()=>{
  const app=foreground.current,panel=drawer.current;
  if(!app||!panel)return;
  probe.current??=startMotionProbe('sidebar');
  if(!host.current?.hasAttribute('data-active')){
   // Blur only when leaving the screen. Preserve the native iframe/textarea;
   // remove its ancestor's translation completely before typing resumes.
   const active=document.activeElement;
   if(active instanceof HTMLIFrameElement){const field=active.contentDocument?.activeElement;if(field&&'blur' in field)(field as HTMLElement).blur()}
   if(active instanceof HTMLElement&&app.contains(active))active.blur();
  }
  if(host.current&&!host.current.hasAttribute('data-active')){host.current.dataset.active='true';window.dispatchEvent(new Event('mobile-sidebar-prepare'))}
  app.dataset.mobileSidebar='true';app.inert=true;
  panel.inert=false;panel.removeAttribute('aria-hidden');
  if(cover.current)cover.current.dataset.active='true';
 };
 const settle=(next:boolean)=>{
  const app=foreground.current,panel=drawer.current;
  probe.current?.stop(next?'open':'closed');probe.current=null;
  if(host.current)delete host.current.dataset.dragging;
  if(content.current)content.current.style.translate='';
  if(dim.current)dim.current.style.opacity='';
  if(!next){
   if(host.current)delete host.current.dataset.active;
   if(cover.current){delete cover.current.dataset.active;cover.current.style.translate=''}
   if(app){delete app.dataset.mobileSidebar;app.style.translate='';app.inert=false}
   if(panel){panel.inert=true;panel.setAttribute('aria-hidden','true')}
   if(keyboardTrigger.current&&opener.current?.isConnected)opener.current.focus({preventScroll:true});
   keyboardTrigger.current=false;
  }else if(keyboardTrigger.current&&!panel?.contains(document.activeElement))panel?.focus({preventScroll:true});
 };
 const syncDom=(next:boolean,animate=true,velocity=0)=>{
  const app=foreground.current,panel=drawer.current;if(!app||!panel)return;
  const from=app.getBoundingClientRect().left;
  stopMotion();prepare();
  if(edgeRef.current)edgeRef.current.dataset.drawerOpen=String(next);
  panel.dataset.drawerState=next?'open':'closed';
  if(cover.current)cover.current.dataset.drawerState=next?'open':'closed';
  if(host.current)delete host.current.dataset.dragging;
  const to=next?document.documentElement.clientWidth:0;
  position(to);
  if(!animate||Math.abs(to-from)<.5){settle(next);return}
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){
   // The screen switches at once; an opening menu comes out from under the shade.
   const start=next?depthAt(from):null,end=next?depthAt(to):null;
   if(start&&end&&dim.current){
    animations.current=[dim.current.animate([{opacity:start.shade},{opacity:end.shade}],{duration:Math.round(motionDuration.micro*1000),easing:motionEasing})];
    animations.current[0].onfinish=()=>{stopMotion();settle(next)};
    return;
   }
   settle(next);return;
  }
  // Both layers share one timeline; interruption starts at the visible position.
  const options=settleOptions(next,Math.abs(to-from),velocity);
  animations.current=[app,cover.current].filter((el):el is HTMLElement=>Boolean(el)).map(el=>el.animate([{translate:`${from}px 0`},{translate:`${to}px 0`}],options));
  const start=depthAt(from),end=depthAt(to);
  if(start&&end&&content.current&&dim.current)animations.current.push(
   content.current.animate([{translate:`${start.shift}px 0`},{translate:`${end.shift}px 0`}],options),
   dim.current.animate([{opacity:start.shade},{opacity:end.shade}],options));
  animations.current[0].onfinish=()=>{stopMotion();settle(next)};
 };
 const setOpenState=(value:Updater,velocity=0,animate=true)=>{
  const current=openRef.current,next=typeof value==='function'?value(current):value;
  if(next===current)return;
  if(next){
   const active=document.activeElement;opener.current=active instanceof HTMLElement?active:null;
   keyboardTrigger.current=Boolean(opener.current?.matches(':focus-visible'));
   if(!mounted)setMounted(true);
  }
  openRef.current=next;syncDom(next,animate,velocity);
  if(next)onOpen?.();else onClose?.();
 };
 const actions=useRef({setOpenState,syncDom});actions.current={setOpenState,syncDom};
 useLayoutEffect(()=>{
  foreground.current=document.querySelector<HTMLElement>('.app');
  if(openRef.current)actions.current.syncDom(true,false);
  else if(drawer.current){drawer.current.inert=true;drawer.current.setAttribute('aria-hidden','true')}
  return()=>{stopMotion();probe.current?.stop('unmount');probe.current=null;const app=foreground.current;if(app){delete app.dataset.mobileSidebar;app.style.translate='';app.inert=false}};
 },[]);
 useEffect(()=>{if(controlledOpen!==undefined&&controlledOpen!==openRef.current)setOpenState(controlledOpen)},[controlledOpen]);
 useEffect(()=>{const listener=(value:Updater,animate:boolean)=>actions.current.setOpenState(value,0,animate);listeners.add(listener);return()=>{listeners.delete(listener)}},[]);
 useEffect(()=>{
  if(mounted)return;
  let idle=0;
  const timer=setTimeout(()=>{if(window.requestIdleCallback)idle=window.requestIdleCallback(()=>setMounted(true),{timeout:400});else setMounted(true)},40);
  return()=>{clearTimeout(timer);if(idle)window.cancelIdleCallback(idle)};
 },[mounted]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(!openRef.current||document.querySelector('[role=menu],[data-slot=dialog-content]:not(.mobile-sidebar-modal)'))return;
   // Passive tooltips consume Escape too. They must not make dismissal take a
   // second press. Actual nested surfaces own Escape above; the search field
   // keeps its local Escape by stopping propagation.
   if(event.key==='Escape'){event.preventDefault();keyboardTrigger.current=true;actions.current.setOpenState(false)}
   else if(event.key==='Tab'&&!event.defaultPrevented){
    const panel=drawer.current;if(!panel)return;
    const items=Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')).filter(el=>!el.closest('[inert]')&&el.getClientRects().length);
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(!first){event.preventDefault();panel.focus({preventScroll:true})}
    else if(event.shiftKey&&(active===first||active===panel)){event.preventDefault();last.focus({preventScroll:true})}
    else if(!event.shiftKey&&(active===last||!panel.contains(active))){event.preventDefault();first.focus({preventScroll:true})}
   }
  };
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[]);
 useEffect(()=>{
  const releaseCapture=(g:Drag)=>{if(g.target.hasPointerCapture(g.id))g.target.releasePointerCapture(g.id)};
  const finish=(event:PointerEvent,cancel=false)=>{
   const g=gesture.current;if(!g||g.id!==event.pointerId)return;
   gesture.current=null;releaseCapture(g);
   if(!g.dragging){if(g.interrupted)animations.current.forEach(animation=>animation.play());return}
   suppressedUntil.current=performance.now()+350;
   const last=g.samples[g.samples.length-1],recent=g.samples.find(s=>event.timeStamp-s.at<=100)||last;
   const direction=g.opening?1:-1;
   const velocity=event.timeStamp-last.at>100?0:(g.dx-recent.x)*direction/Math.max(1,event.timeStamp-recent.at);
   const commit=!cancel&&shouldFinishSidebarDrag(g.offset,g.width,Math.abs(g.dx),velocity,g.opening);
   const next=cancel?!g.opening:g.opening?commit:!commit;
   // Speed toward the state that is actually reached, which is opposite to the gesture when it is cancelled.
   const toward=cancel||!commit?-velocity:velocity;
   if(next!==openRef.current){keyboardTrigger.current=false;actions.current.setOpenState(next,toward)}
   else actions.current.syncDom(next,true,toward);
  };
  const down=(event:PointerEvent)=>{
   suppressedUntil.current=0;
   if(!event.isPrimary||event.button!==0||gesture.current)return;
   const node=event.target instanceof Element?event.target:null;if(!node)return;
   if(document.querySelector('[role=menu],[data-slot=dialog-content]:not(.mobile-sidebar-modal)'))return;
   const edge=node.closest<HTMLElement>('.sidebar-swipe-edge'),content=node.closest<HTMLElement>('.sidebar-swipe-content'),overlay=node.closest<HTMLElement>('.mobile-sidebar-overlay');
   const interrupted=animations.current.some(animation=>animation.playState==='running');
   const opening=!openRef.current;
   if(opening&&!interrupted&&!edge)return;
   if(!edge&&!content&&!overlay||node.closest('input,textarea,select,[contenteditable=true]'))return;
   const target=edge||content||overlay;if(!target)return;
   if(interrupted)animations.current.forEach(animation=>animation.pause());
   const width=document.documentElement.clientWidth,origin=(foreground.current?.getBoundingClientRect().left||0)-width;
   gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,opening,interrupted,origin,width,offset:origin,dragging:false,target,samples:[{x:0,at:event.timeStamp}]};
  };
  const move=(event:PointerEvent)=>{
   const g=gesture.current;if(!g||g.id!==event.pointerId)return;
   g.dx=event.clientX-g.x;const dy=event.clientY-g.y;
   if(!g.dragging){
    if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(g.dx)){gesture.current=null;if(g.interrupted)animations.current.forEach(animation=>animation.play());return}
    if(Math.abs(g.dx)<8||!g.interrupted&&g.dx*(g.opening?1:-1)<8||Math.abs(g.dx)<=Math.abs(dy)*1.4)return;
    // Commit the paused transition to pixels after horizontal intent is clear.
    g.origin=(foreground.current?.getBoundingClientRect().left||0)-g.width;
    stopMotion();prepare();
    g.dragging=true;suppressedUntil.current=performance.now()+350;g.target.setPointerCapture(g.id);
    if(host.current)host.current.dataset.dragging='true';
   }
   if(event.cancelable)event.preventDefault();
   g.samples.push({x:g.dx,at:event.timeStamp});g.samples=g.samples.filter(sample=>event.timeStamp-sample.at<=120);
   g.offset=sidebarDragOffset(g.origin,g.dx,g.width);position(g.width+g.offset,g.width);
   const crossed=shouldFinishSidebarDrag(g.offset,g.width,Math.abs(g.dx),0,g.opening);
   if(crossed!==Boolean(g.crossed)){g.crossed=crossed;triggerHaptic('sidebar')}
  };
  const up=(event:PointerEvent)=>finish(event),cancel=(event:PointerEvent)=>finish(event,true);
  const lost=(event:PointerEvent)=>{const g=gesture.current;if(g&&event.target===g.target&&!g.target.hasPointerCapture(g.id))finish(event,true)};
  const click=(event:MouseEvent)=>{if(event.detail!==0&&performance.now()<suppressedUntil.current){event.preventDefault();event.stopPropagation()}};
  let viewportWidth=document.documentElement.clientWidth;
  const resize=()=>{
   const width=document.documentElement.clientWidth;if(width===viewportWidth)return;viewportWidth=width;
   const g=gesture.current;gesture.current=null;if(g)releaseCapture(g);
   if(host.current?.hasAttribute('data-active'))actions.current.syncDom(openRef.current,false);
  };
  document.addEventListener('pointerdown',down);document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('lostpointercapture',lost);document.addEventListener('click',click,true);window.addEventListener('resize',resize);
  return()=>{const g=gesture.current;gesture.current=null;if(g)releaseCapture(g);document.removeEventListener('pointerdown',down);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('lostpointercapture',lost);document.removeEventListener('click',click,true);window.removeEventListener('resize',resize)};
 },[]);
 const active=openRef.current;
 return createPortal(<>
  <div ref={edgeRef} className="sidebar-swipe-edge" aria-hidden="true" data-drawer-open={active}/>
  <div ref={host} className="mobile-sidebar-host">
   <div ref={drawer} role="dialog" aria-modal="true" aria-label="Меню" data-slot="dialog-content" data-drawer-state={active?'open':'closed'} tabIndex={-1} className="premium-modal mobile-sidebar-modal">
    <div className="modal-heading"><h2>Меню</h2></div>
    <div ref={content} className="sidebar-swipe-content">{mounted&&children}</div>
   </div>
   <div ref={dim} className="mobile-sidebar-dim" aria-hidden="true"/>
  </div>
  <div ref={cover} data-drawer-state={active?'open':'closed'} className="mobile-sidebar-overlay" aria-hidden="true" onClick={()=>setOpenState(false)}/>
 </>,document.body);
}
