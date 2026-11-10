import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Popover} from 'radix-ui';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';

// Moving between truncated titles skips the delay and the entrance, like the hint tooltips.
let previewClosedAt=-Infinity;
const previewWarmMs=300;
export function ChatTitleButton({title,active,onSelect,children}:{title:string;active:boolean;onSelect:()=>void;children:ReactNode}){
 const[open,setOpen]=useState(false),text=useRef<HTMLSpanElement>(null),timer=useRef<ReturnType<typeof setTimeout>>(undefined),start=useRef<{x:number;y:number}|null>(null),held=useRef(false),id=useId();
 const[instant,setInstant]=useState(false);const cancel=()=>{clearTimeout(timer.current)};
 const reduced=useReducedMotion();
 const truncated=()=>{const label=Array.from(text.current?.children||[]).find(node=>node.textContent===title) as HTMLElement|undefined;return !!label&&label.scrollWidth>label.clientWidth+1};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Anchor asChild>
  <button aria-label={title} aria-current={active?'page':undefined} aria-describedby={open?id:undefined}
   onPointerEnter={event=>{if(event.pointerType==='mouse'&&truncated()){cancel();if(performance.now()-previewClosedAt<previewWarmMs){setInstant(true);setOpen(true)}else{setInstant(false);timer.current=setTimeout(()=>setOpen(true),350)}}}}
   onPointerLeave={event=>{cancel();if(event.pointerType==='mouse'){if(open)previewClosedAt=performance.now();setOpen(false)}}}
   onPointerDown={event=>{cancel();held.current=false;if(event.pointerType==='touch'&&truncated()){start.current={x:event.clientX,y:event.clientY};timer.current=setTimeout(()=>{held.current=true;setOpen(true)},450)}}}
   onPointerMove={event=>{if(start.current&&(Math.abs(event.clientX-start.current.x)>8||Math.abs(event.clientY-start.current.y)>8)){cancel();start.current=null}}}
   onPointerUp={()=>{cancel();start.current=null}} onPointerCancel={()=>{cancel();start.current=null;held.current=false}}
   onContextMenu={event=>{if(start.current||held.current)event.preventDefault()}}
   onFocus={event=>{cancel();setInstant(false);const button=event.currentTarget;timer.current=setTimeout(()=>{if(button===document.activeElement&&button.matches(':focus-visible')&&truncated())setOpen(true)},0)}} onBlur={()=>{cancel();setOpen(false)}}
   onKeyDown={event=>{held.current=false;if(event.key==='Escape')setOpen(false)}}
   onClick={event=>{cancel();if(held.current){event.preventDefault();held.current=false;return}setOpen(false);onSelect()}}>
   {children}<span ref={text} className="chat-title-text"><AnimatePresence initial={false}><motion.span key={title} initial={{opacity:0,y:reduced?0:3}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-3}} transition={{duration:reduced?0:.22,ease:[.23, 1, .32, 1]}}>{title}</motion.span></AnimatePresence></span>
  </button>
 </Popover.Anchor><Popover.Portal><Popover.Content id={id} role="tooltip" className="chat-title-preview" data-instant={instant||undefined} side="right" align="start" sideOffset={10} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()}>{title}</Popover.Content></Popover.Portal></Popover.Root>;
}
