import {useEffect,useRef,useState,type RefObject} from 'react';
import {ArrowDown} from '../icons';
import {IconButton} from './primitives';
import {observeBottomButton} from '../bottomButtonVisibility';
import {diagnostic} from '../diagnostics';
import './ScrollToBottom.css';

export function ScrollToBottom({container,enabled,forceVisible=false,onClick}:{container:RefObject<HTMLDivElement|null>;enabled:boolean;forceVisible?:boolean;onClick:()=>void}){
 const [visible,setVisible]=useState(false);
 const shown=enabled&&(visible||forceVisible);
 const touch=useRef<{id:number;x:number;y:number}|null>(null),suppressClickUntil=useRef(0);
 useEffect(()=>{
  setVisible(false);
  if(!enabled||!container.current)return;
  return observeBottomButton(container.current,setVisible);
 },[container,enabled]);
 return <div className="scroll-bottom-position scroll-bottom-visibility" data-visible={shown} aria-hidden={!shown} inert={!shown}>
  <IconButton label="К последнему сообщению" className="scroll-bottom" tabIndex={shown?0:-1}
   onTouchStart={event=>{const point=event.touches[0];touch.current=event.touches.length===1&&point?{id:point.identifier,x:point.clientX,y:point.clientY}:null;if(touch.current)diagnostic('client.lifecycle',{source:'scroll_bottom_touch',state:'start'})}}
   onTouchMove={event=>{const start=touch.current,point=event.touches[0];if(!start||event.touches.length!==1||!point||point.identifier!==start.id||Math.hypot(point.clientX-start.x,point.clientY-start.y)>8)touch.current=null}}
   onTouchCancel={()=>{touch.current=null}}
   onTouchEnd={event=>{
    const start=touch.current;touch.current=null;
    const point=Array.from(event.changedTouches).find(point=>point.identifier===start?.id);
    if(!shown||!start||event.touches.length||!point||Math.hypot(point.clientX-start.x,point.clientY-start.y)>8)return;
    // Safari can omit click when a tap interrupts momentum. Accept the unmoved
    // release itself, then consume its compatibility click if one still arrives.
    event.preventDefault();suppressClickUntil.current=performance.now()+700;onClick();
   }}
   onClick={event=>{if(event.detail!==0&&performance.now()<suppressClickUntil.current){event.preventDefault();return}onClick()}}><ArrowDown size={18}/></IconButton>
 </div>;
}
