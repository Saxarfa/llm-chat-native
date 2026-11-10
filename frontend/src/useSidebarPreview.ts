import {useCallback,useEffect,useRef,useState} from 'react';

/** A mouse-only peek does not change the saved sidebar preference or steal focus. */
export function useSidebarPreview(enabled:boolean){
 const [preview,setPreview]=useState(false),visible=useRef(false),opening=useRef<ReturnType<typeof setTimeout>>(undefined),closing=useRef<ReturnType<typeof setTimeout>>(undefined),blockedUntil=useRef(0);
 visible.current=preview;
 const clear=useCallback(()=>{clearTimeout(opening.current);opening.current=undefined;clearTimeout(closing.current);closing.current=undefined},[]);
 const dismiss=useCallback(()=>{clear();blockedUntil.current=performance.now()+350;setPreview(false)},[clear]);
 useEffect(()=>{
  if(!enabled){clear();setPreview(false);return}
  const mouse=matchMedia('(hover: hover) and (pointer: fine)');
  let keyboard=false,pointerInside=false;
  let point:{x:number;y:number}|undefined;
  const underPointer=()=>{const bounds=document.querySelector('.desktop-sidebar')?.getBoundingClientRect();return !!point&&!!bounds&&point.x>=bounds.left&&point.x<bounds.right&&point.y>=bounds.top&&point.y<bounds.bottom};
  const element=(target:EventTarget|null)=>target instanceof Element?target:null;
  const inside=(target:EventTarget|null)=>!!element(target)?.closest('.desktop-sidebar,[data-sidebar-preview-trigger]');
  const portal=()=>!!document.querySelector('[role="menu"][data-state="open"],[role="dialog"][data-state="open"]');
  const focused=()=>{
   const active=document.activeElement;
   return !!active?.closest('.desktop-sidebar')&&(keyboard||active.matches('input,textarea,[contenteditable="true"]'));
  };
  const keep=()=>{clearTimeout(closing.current);closing.current=undefined};
  const leave=()=>{
   clearTimeout(opening.current);opening.current=undefined;
   if(underPointer()||pointerInside||!visible.current)return;
   if(closing.current)return;
   closing.current=setTimeout(()=>{closing.current=undefined;if(!underPointer()&&!pointerInside&&!portal()&&!focused())setPreview(false)},60);
  };
  const over=(event:PointerEvent)=>{
   if(event.pointerType!=='mouse'||!mouse.matches)return;point={x:event.clientX,y:event.clientY};
   pointerInside=inside(event.target);
   if(pointerInside){
    keep();
    if(element(event.target)?.closest('[data-sidebar-preview-trigger]')&&!opening.current&&!portal()&&performance.now()>=blockedUntil.current){
     opening.current=setTimeout(()=>{opening.current=undefined;setPreview(true)},35);
    }
   }else leave();
  };
  const out=(event:PointerEvent)=>{if(event.pointerType==='mouse'&&inside(event.target)&&!inside(event.relatedTarget)){point={x:event.clientX,y:event.clientY};pointerInside=underPointer();if(!pointerInside)leave()}};
  // Portal menus can close without another pointerover. The next mouse movement
  // resumes the normal delayed dismissal, while open menus retain their owner.
  const move=(event:PointerEvent)=>{if(event.pointerType!=='mouse')return;point={x:event.clientX,y:event.clientY};pointerInside=inside(event.target)||underPointer();if(pointerInside)keep();else leave()};
  const down=(event:PointerEvent)=>{keyboard=false;if(!inside(event.target)&&!portal())dismiss()};
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Tab')keyboard=true;
   if(event.key==='Escape'&&!event.defaultPrevented&&!portal()){
    const restore=!!document.activeElement?.closest('.desktop-sidebar');dismiss();
    if(restore)document.querySelector<HTMLElement>('[data-sidebar-preview-trigger]')?.focus({preventScroll:true});
   }
  };
  const focus=()=>{if(focused())keep();else leave()};
  const reset=()=>dismiss();
  const visibility=()=>{if(document.hidden)dismiss()};
  document.addEventListener('pointerover',over);document.addEventListener('pointerout',out);document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerdown',down);document.addEventListener('keydown',key);document.addEventListener('focusin',focus);document.addEventListener('focusout',focus);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',reset);mouse.addEventListener('change',reset);
  return()=>{clear();document.removeEventListener('pointerover',over);document.removeEventListener('pointerout',out);document.removeEventListener('pointermove',move);document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);document.removeEventListener('focusout',focus);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',reset);mouse.removeEventListener('change',reset)};
 },[enabled,clear,dismiss]);
 return {preview:enabled&&preview,dismiss};
}
