import {useEffect,useRef,type RefObject} from 'react';
import {motionDuration,motionEasing} from './motion';
import {shouldDismissSheet} from './gestures';
import {triggerHaptic} from './haptics';
import {afterSurfaceMotion} from './surfaceCompletion';
import {motionProfile} from './motionProfile';
import {solveSpringSettle,supportsLinearEasing} from './motionSpring';
import {startMotionProbe,type MotionProbe} from './motionProbe';

const springs=()=>motionProfile()==='fluid'&&supportsLinearEasing()&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const DISMISS_PAST=24;

/** Drag only a surface's header. Form fields and scrolling content keep native gestures. */
export function useSurfaceSwipe(ref:RefObject<HTMLElement|null>,handle:string,onDismiss:()=>void,enabled=true){
 const dismiss=useRef(onDismiss);dismiss.current=onDismiss;
 useEffect(()=>{
  if(!enabled)return;
  let drag:{id:number;x:number;y:number;dy:number;origin:number;offset:number;lastY:number;at:number;velocity:number;active:boolean;el:HTMLElement}|undefined;
  let completion:(()=>void)|null=null,suppressUntil=0,frame=0,probe:MotionProbe|null=null;
  const stopProbe=(state:string)=>{const current=probe;probe=null;if(current)setTimeout(()=>current.stop(state),400)};
  const paint=()=>{frame=0;if(drag?.active)drag.el.style.translate=`0 ${drag.offset}px`};
  const cancelPaint=()=>{cancelAnimationFrame(frame);frame=0};
  // speed: px/ms toward the resting place (upward), handed over from the finger.
  const reset=(el:HTMLElement,offset=0,speed=0)=>{
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const spring=springs()&&offset>.5?solveSpringSettle(offset,speed,38):null;
   el.style.transition=reduced?'none':spring?`translate ${spring.duration}ms ${spring.easing}`:`translate ${motionDuration.exit}s ${motionEasing}`;
   el.style.translate='0 0';
   completion?.();completion=afterSurfaceMotion(el,()=>{completion=null;el.style.removeProperty('translate');el.style.removeProperty('transition');el.style.removeProperty('opacity');el.style.removeProperty('--surface-release-y');clearDismiss(el);delete el.dataset.surfaceDragging});
  };
  const finish=(e:PointerEvent,cancel=false)=>{
   const g=drag;if(!g||g.id!==e.pointerId)return;cancelPaint();if(g.active)g.el.style.translate=`0 ${g.offset}px`;drag=undefined;
   if(g.el.hasPointerCapture(g.id))g.el.releasePointerCapture(g.id);
   if(!g.active)return;
   if(cancel){reset(g.el,g.offset);stopProbe('cancelled');return}
   suppressUntil=performance.now()+300;
   const velocity=e.timeStamp-g.at>100?0:g.velocity;
   const close=!cancel&&shouldDismissSheet(g.offset,g.el.clientHeight,velocity);
   if(!close){reset(g.el,g.offset,-velocity);stopProbe('returned');return}
   stopProbe('dismissed');
   triggerHaptic('light');
   g.el.style.setProperty('--surface-release-y',`${g.offset}px`);
   if(springs()){
    // Slide fully below the screen at the finger's speed instead of a short fade.
    const travel=Math.max(60,innerHeight-g.el.getBoundingClientRect().top)+DISMISS_PAST;
    const spring=solveSpringSettle(travel,velocity,34,DISMISS_PAST);
    g.el.style.setProperty('--surface-dismiss-travel',`${travel}px`);
    g.el.style.setProperty('--surface-dismiss-duration',`${spring.duration}ms`);
    g.el.style.setProperty('--surface-dismiss-easing',spring.easing);
    g.el.style.setProperty('--surface-dismiss-opacity','1');
    // A closing transition must not fade the sheet while it is still on screen.
    g.el.style.opacity='1';
   }
   dismiss.current();
   // Dirty forms may keep the surface open and ask for confirmation.
   requestAnimationFrame(()=>{if(g.el.isConnected&&g.el.dataset.state!=='closed')reset(g.el,g.offset)});
  };
  const clearDismiss=(el:HTMLElement)=>{for(const name of ['--surface-dismiss-travel','--surface-dismiss-duration','--surface-dismiss-easing','--surface-dismiss-opacity'])el.style.removeProperty(name)};
  const down=(e:PointerEvent)=>{
   // A new tap must work immediately, including confirmation buttons.
   suppressUntil=0;
   const el=ref.current,node=e.target instanceof Element?e.target:null;
   if(!el||!matchMedia('(max-width:800px)').matches||!e.isPrimary||e.button!==0||drag||!node?.closest(handle)||!el.contains(node)||node.closest('button,a,input,textarea,select,[role=slider]'))return;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,dy:0,origin:0,offset:0,lastY:e.clientY,at:e.timeStamp,velocity:0,active:false,el};
  };
  const move=(e:PointerEvent)=>{
   const g=drag;if(!g||g.id!==e.pointerId)return;
   const dx=e.clientX-g.x,dy=e.clientY-g.y;
   if(!g.active){
    if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)||dy < -8){drag=undefined;return}
    if(dy<8||dy<Math.abs(dx)*1.3)return;
    completion?.();completion=null;
    const rendered=g.el.getBoundingClientRect().top;
    g.active=true;g.el.setPointerCapture(e.pointerId);g.el.dataset.surfaceSwiped='true';g.el.dataset.surfaceDragging='true';g.el.style.transition='none';g.el.style.translate='0 0';
    probe?.stop('interrupted');probe=startMotionProbe('sheet');
    // Freeze an interrupted entry/return at its actual rendered position.
    const resting=g.el.getBoundingClientRect().top,offset=Math.max(0,rendered-resting);
    g.origin=offset>1?offset-dy:0;
   }
   if(e.cancelable)e.preventDefault();
   const dt=e.timeStamp-g.at;if(dt>0)g.velocity=(e.clientY-g.lastY)/dt;
   g.at=e.timeStamp;g.lastY=e.clientY;g.dy=dy;g.offset=Math.max(0,g.origin+dy);if(!frame)frame=requestAnimationFrame(paint);
  };
  const up=(e:PointerEvent)=>finish(e),cancel=(e:PointerEvent)=>finish(e,true);
  const lost=(e:PointerEvent)=>{const g=drag;if(g&&e.target===g.el&&!g.el.hasPointerCapture(g.id))finish(e,true)};
  const click=(e:MouseEvent)=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopPropagation()}};
  document.addEventListener('pointerdown',down);document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('lostpointercapture',lost);document.addEventListener('click',click,true);
  return()=>{cancelPaint();const el=drag?.el||ref.current;drag=undefined;completion?.();completion=null;if(el&&el.dataset.state!=='closed'){el.style.removeProperty('translate');el.style.removeProperty('transition');el.style.removeProperty('opacity');el.style.removeProperty('--surface-release-y');clearDismiss(el);delete el.dataset.surfaceDragging}document.removeEventListener('pointerdown',down);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('lostpointercapture',lost);document.removeEventListener('click',click,true)};
 },[enabled,handle,ref]);
}
