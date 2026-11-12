import {solveSpringSettle,supportsLinearEasing} from './motionSpring';
import {motionProfile} from './motionProfile';
import {motionEasing} from './motion';

/* Keeps an element's movement continuous when the layout around it changes in
 * one step: the studio stage collapsing for the keyboard, or the page height
 * catching up with the viewport. Layout jumps once; the element is drawn from
 * where it was and settles with a compositor transform. A running glide is
 * retargeted from its rendered offset instead of restarting.
 *
 * Only shifts inside an armed window are followed, so content that animates its
 * own height (notes, errors) is not chased frame by frame. */
const ARM_MS=700;

function renderedOffset(el:HTMLElement){
 const match=/^\S+\s+(-?[\d.]+)px/.exec(getComputedStyle(el).translate||'');
 return match?Number(match[1]):0;
}

export function followLayoutShift(target:HTMLElement,watch:HTMLElement[],reduced:()=>boolean){
 let last=target.offsetTop,armedUntil=0,glide:Animation|null=null;
 const sync=()=>{
  const top=target.offsetTop,delta=last-top;last=top;
  if(Math.abs(delta)<1||performance.now()>armedUntil||reduced())return;
  const from=delta+(glide?renderedOffset(target):0);
  glide?.cancel();
  const spring=motionProfile()==='fluid'&&supportsLinearEasing()?solveSpringSettle(Math.abs(from),0,31):null;
  glide=target.animate([{translate:`0 ${from}px`},{translate:'0 0'}],{duration:spring?.duration??300,easing:spring?.easing??motionEasing});
  const current=glide;current.onfinish=current.oncancel=()=>{if(glide===current)glide=null};
 };
 const observer=new ResizeObserver(sync);
 for(const el of [target,...watch])observer.observe(el);
 // Focus changes are followed at once: an observer would only see them after the
 // frame's own rAF work has already read the new layout.
 const arm=()=>{armedUntil=performance.now()+ARM_MS;sync()};
 const viewport=window.visualViewport;
 const armViewport=()=>{armedUntil=performance.now()+ARM_MS};
 viewport?.addEventListener('resize',armViewport);
 return{arm,stop:()=>{observer.disconnect();viewport?.removeEventListener('resize',armViewport);glide?.cancel();glide=null}};
}
