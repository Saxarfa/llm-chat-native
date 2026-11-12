/** Keep focus indication tied to keyboard navigation, including restored focus. */
export function initializeFocusInput(doc:Document=document){
 const root=doc.documentElement;
 const keyboard=(event:KeyboardEvent)=>{if(event.key==='Tab'&&!event.ctrlKey&&!event.altKey&&!event.metaKey)root.dataset.keyboardFocus='true'};
 const pointer=()=>{delete root.dataset.keyboardFocus};
 doc.addEventListener('keydown',keyboard,true);
 doc.addEventListener('pointerdown',pointer,true);
 doc.addEventListener('mousedown',pointer,true);
 doc.addEventListener('touchstart',pointer,true);
}
