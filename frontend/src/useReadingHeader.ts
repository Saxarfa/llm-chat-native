import {useLayoutEffect,useRef,type RefObject} from 'react';

/** Reveal navigation when reading back; let deliberate forward scrolling use
 * the whole screen. Writes only at a direction threshold, never per frame. */
export function useReadingHeader(scroll:RefObject<HTMLDivElement|null>,enabled:boolean,resetKey:string,blocked:boolean,ignoreScroll:()=>boolean){
 const header=useRef<HTMLElement>(null),ignore=useRef(ignoreScroll),sync=useRef<(top:number)=>void>(()=>{});ignore.current=ignoreScroll;
 useLayoutEffect(()=>{
  const bar=header.current,area=scroll.current;if(!bar||!area)return;
  if(bar.dataset.readingHidden){delete bar.dataset.readingHidden;bar.inert=false;bar.removeAttribute('aria-hidden')}
  if(!enabled||blocked){sync.current=()=>{};return}
  let hidden=false,last=area.scrollTop,travel=0,direction=0,intentUntil=0,keyboardNavigation=false;
  // Prepending paginated history compensates scrollTop without a user gesture.
  sync.current=top=>{last=top;travel=0;direction=0};
  const show=(hide=false)=>{
   if(hide===hidden)return;hidden=hide;
   bar.dataset.readingHidden=String(hide);bar.inert=hide;
   if(hide)bar.setAttribute('aria-hidden','true');else bar.removeAttribute('aria-hidden');
  };
  const reveal=()=>{show();travel=0;direction=0;intentUntil=0;last=area.scrollTop};
  const intent=(event:Event)=>{
   const node=event.target instanceof Element?event.target:null;
   if(node?.closest('pre,.table-scroll,.reasoning-text,input,textarea'))return;
   keyboardNavigation=false;
   if(performance.now()>intentUntil){last=area.scrollTop;travel=0;direction=0}
   intentUntil=performance.now()+1500;
  };
  const scrolled=()=>{
   const top=Math.max(0,Math.min(area.scrollTop,area.scrollHeight-area.clientHeight)),delta=top-last;last=top;
   if(ignore.current()||document.documentElement.dataset.viewportResizing==='true'){travel=0;return}
   if(top<40){reveal();return}
   if(performance.now()>intentUntil||document.documentElement.dataset.keyboard==='true'||(keyboardNavigation&&bar.contains(document.activeElement))||bar.querySelector('[data-state=open]')){travel=0;return}
   if(Math.abs(delta)<.5)return;
   const next=delta>0?1:-1;if(next!==direction){travel=0;direction=next}travel+=Math.abs(delta);
   if(direction>0&&travel>=24&&top>100)show(true);
   else if(direction<0&&travel>=10)show(false);
  };
  const key=(event:KeyboardEvent)=>{if(event.key==='Tab')keyboardNavigation=true;if(event.key==='Tab'||event.key==='Escape')reveal()};
  const focus=(event:FocusEvent)=>{const target=event.target;if(target instanceof Element&&(bar.contains(target)||target.matches('input,textarea,[contenteditable=true]')))reveal()};
  area.addEventListener('touchmove',intent,{passive:true});area.addEventListener('wheel',intent,{passive:true});area.addEventListener('scroll',scrolled,{passive:true});
  document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
  window.addEventListener('mobile-viewport-changing',reveal);window.addEventListener('composer-focus',reveal);
  return()=>{
   sync.current=()=>{};
   area.removeEventListener('touchmove',intent);area.removeEventListener('wheel',intent);area.removeEventListener('scroll',scrolled);
   document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);window.removeEventListener('mobile-viewport-changing',reveal);window.removeEventListener('composer-focus',reveal);
   if(bar.dataset.readingHidden){delete bar.dataset.readingHidden;bar.inert=false;bar.removeAttribute('aria-hidden')}
  };
 },[scroll,enabled,resetKey,blocked]);
 return {header,syncScroll:(top:number)=>sync.current(top)};
}
