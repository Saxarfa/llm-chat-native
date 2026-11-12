/** iPad can advertise itself as a Mac; desktop touch emulation is not iOS. */
export function isIOSWebKit(userAgent:string,platform:string,touchPoints:number){
 return /AppleWebKit/i.test(userAgent)&&(/iPhone|iPad|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1));
}

/** Also used by welcome buttons that focus the dock inside their click gesture. */
export function focusDockWithoutPan(field:HTMLTextAreaElement,doc:Document,win:Window){
 if(!isIOSWebKit(win.navigator.userAgent,win.navigator.platform,win.navigator.maxTouchPoints)||field===doc.activeElement||(win.visualViewport&&Math.abs(win.visualViewport.scale-1)>.015)){
  field.focus({preventScroll:true});return()=>{};
 }
 const opacity=field.style.getPropertyValue('opacity'),priority=field.style.getPropertyPriority('opacity');
 let frame=0;
 const restore=()=>{win.cancelAnimationFrame(frame);frame=0;if(opacity)field.style.setProperty('opacity',opacity,priority);else field.style.removeProperty('opacity')};
 field.style.setProperty('opacity','0','important');
 try{field.focus({preventScroll:true})}finally{frame=win.requestAnimationFrame(restore)}
 return restore;
}

/**
 * Focus a bottom dock within the original touch gesture, before Safari's
 * automatic "reveal focused input" pan. The field alone is transparent for
 * one frame. Once editing, Safari owns caret placement and text selection.
 * Already focused fields retain native selection and long-press behaviour.
 */
export function installIOSKeyboardFocusGuard(doc:Document,win:Window,dockField?:HTMLTextAreaElement){
 if(!isIOSWebKit(win.navigator.userAgent,win.navigator.platform,win.navigator.maxTouchPoints))return()=>{};
 let restore:(()=>void)|undefined;
 let tap:{field:HTMLTextAreaElement;id:number;x:number;y:number;at:number}|undefined;
 const reveal=()=>{restore?.();restore=undefined};
 const cancel=()=>{tap=undefined};
 const touchStarted=(event:TouchEvent)=>{
  cancel();
  // An isolated editor has no composer ancestor inside its document, and its
  // textarea belongs to another Window. Its owner supplies the exact field;
  // win remains the parent so pinch zoom and paint use the screen viewport.
  const field=dockField??(event.target instanceof HTMLTextAreaElement?event.target:undefined);
  if(!field||event.target!==field||event.defaultPrevented||event.touches.length!==1||field.disabled||field.readOnly||field===doc.activeElement||(!dockField&&!field.closest('.composer,.mobile-studio-composer,.chat-composer,.nano-composer')))return;
  const point=event.touches[0];
  tap={field,id:point.identifier,x:point.clientX,y:point.clientY,at:event.timeStamp};
 };
 const touchMoved=(event:TouchEvent)=>{
  if(!tap)return;
  const point=Array.from(event.touches).find(t=>t.identifier===tap?.id);
  // Once a gesture becomes a scroll, returning to its origin cannot make it a tap.
  if(event.touches.length!==1||!point||Math.hypot(point.clientX-tap.x,point.clientY-tap.y)>8)cancel();
 };
 const touchEnded=(event:TouchEvent)=>{
  const candidate=tap;cancel();
  if(!candidate||event.defaultPrevented||event.changedTouches.length!==1||event.touches.length)return;
  const point=event.changedTouches[0],field=candidate.field;
  if(point.identifier!==candidate.id||Math.hypot(point.clientX-candidate.x,point.clientY-candidate.y)>8||event.timeStamp-candidate.at>500)return;
  if(event.target!==field||!field.isConnected||field.disabled||field.readOnly||field===doc.activeElement)return;
  if(win.visualViewport&&Math.abs(win.visualViewport.scale-1)>.015)return;
  // Focusing expands the composer. Its compatibility mouse click can otherwise
  // hit the newly moved controls and immediately blur the field again in WebKit.
  if(event.cancelable)event.preventDefault();
  reveal();restore=focusDockWithoutPan(field,doc,win);
 };
 doc.addEventListener('touchstart',touchStarted,{capture:true,passive:true});
 doc.addEventListener('touchmove',touchMoved,{capture:true,passive:true});
 doc.addEventListener('touchend',touchEnded,{capture:true,passive:false});
 doc.addEventListener('touchcancel',cancel,true);
 doc.addEventListener('pointercancel',cancel,true);
 doc.addEventListener('scroll',cancel,true);
 return()=>{
  doc.removeEventListener('touchstart',touchStarted,true);doc.removeEventListener('touchmove',touchMoved,true);doc.removeEventListener('touchend',touchEnded,true);
  doc.removeEventListener('touchcancel',cancel,true);doc.removeEventListener('pointercancel',cancel,true);doc.removeEventListener('scroll',cancel,true);cancel();reveal();
 };
}
