import {boundedScrollTop} from './chatScrollFollow';
// This observer belongs to the floating button, never to App: crossing the
// threshold must not render the conversation or run its layout animations.
export function observeBottomButton(scroll:HTMLElement,onChange:(visible:boolean)=>void){
 let frame=0,visible=false,height=0,viewport=0,top=0;
 const measure=()=>{
  frame=0;
  const distance=Math.max(0,height-viewport-boundedScrollTop(top,height,viewport));
  const next=visible?distance>72:distance>100;
  if(next!==visible){visible=next;onChange(next)}
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};
 // Read dimensions after layout in ResizeObserver, never in the next frame
 // after a streamed paragraph has dirtied the document again.
 const resized=()=>{height=scroll.scrollHeight;viewport=scroll.clientHeight;top=scroll.scrollTop;schedule()};
 const scrolled=()=>{top=scroll.scrollTop;schedule()};
 scroll.addEventListener('scroll',scrolled,{passive:true});
 const resize=new ResizeObserver(resized);
 resize.observe(scroll);
 const column=scroll.querySelector('.message-column');if(column)resize.observe(column);
 window.addEventListener('mobile-viewport-settled',resized);
 resized();
 return()=>{cancelAnimationFrame(frame);scroll.removeEventListener('scroll',scrolled);resize.disconnect();window.removeEventListener('mobile-viewport-settled',resized)};
}
