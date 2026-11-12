import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';

export type RegenerationRequest={chatId:string;messageId:string;generating?:boolean};
type Reservation={chatId:string;messageId:string;questionId?:string;height:number;node:HTMLElement;originalMinHeight:string;seenLive:boolean;branchId:string};

// Replacing a long answer must not collapse the scroll range while the model
// prepares its next response. Keep its space and read from the question again.
export function useRegenerationScroll(scroll:RefObject<HTMLDivElement|null>,chatId:string,branchId:string,targetId:string|undefined,reduced:boolean|null,pauseFollowing:()=>void,enabled=true){
 const current=useRef({chatId,branchId,targetId,reduced,pauseFollowing,enabled});current.current={chatId,branchId,targetId,reduced,pauseFollowing,enabled};
 const held=useRef<Reservation|null>(null),release=useRef<Animation|null>(null);
 const find=(id:string)=>[...scroll.current?.querySelectorAll<HTMLElement>('[data-message-id]')||[]].find(node=>node.dataset.messageId===id);
 const clear=()=>{release.current?.cancel();release.current=null;const saved=held.current;if(saved){saved.node.style.minHeight=saved.originalMinHeight;held.current=null}};
 const position=(saved:Reservation,smooth:boolean)=>{
  const scroller=scroll.current,anchor=(saved.questionId&&find(saved.questionId))||find(saved.messageId);if(!scroller||!anchor)return;
  const header=scroller.closest('.main-panel')?.querySelector<HTMLElement>('.chat-header');
  const top=anchor.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-(header?.offsetHeight||0)-20;
  scroller.scrollTo({top:Math.max(0,top),behavior:smooth&&!current.current.reduced?'smooth':'instant'});
 };
 const begin=(messageId:string)=>{
  const node=find(messageId);if(!node)return;
  clear();current.current.pauseFollowing();
  const nodes=[...scroll.current!.querySelectorAll<HTMLElement>('[data-message-id]')],index=nodes.indexOf(node);
  const question=nodes.slice(0,index).findLast(el=>el.classList.contains('user-message'));
  const saved:Reservation={chatId:current.current.chatId,branchId:current.current.branchId,messageId,questionId:question?.dataset.messageId,height:node.getBoundingClientRect().height,node,originalMinHeight:node.style.minHeight,seenLive:false};
  held.current=saved;node.style.minHeight=`${saved.height}px`;position(saved,true);
 };
 const finish=()=>{
  const saved=held.current;if(!saved||release.current)return;
  // Child bounds describe the new answer's natural height without temporarily
  // removing min-height and clamping scrollTop during a forced layout.
  const top=saved.node.getBoundingClientRect().top;
  const height=Math.max(0,...[...saved.node.children].map(child=>child.getBoundingClientRect().bottom-top));
  if(current.current.reduced||height>=saved.height){clear();return}
  const animation=saved.node.animate([{minHeight:`${saved.height}px`},{minHeight:`${height}px`}],{duration:280,easing:'cubic-bezier(.23,1,.32,1)',fill:'forwards'});
  release.current=animation;void animation.finished.then(()=>{if(held.current===saved)clear()},()=>{});
 };
 useEffect(()=>{
  const start=(event:Event)=>{const data=(event as CustomEvent<RegenerationRequest>).detail;if(current.current.enabled&&data.chatId===current.current.chatId)begin(data.messageId)};
  const settled=(event:Event)=>{const data=(event as CustomEvent<RegenerationRequest>).detail;if(data.chatId===held.current?.chatId&&data.messageId===held.current.messageId&&!data.generating)finish()};
  window.addEventListener('chat-regeneration-start',start);window.addEventListener('chat-regeneration-settled',settled);
  return()=>{window.removeEventListener('chat-regeneration-start',start);window.removeEventListener('chat-regeneration-settled',settled);clear()};
 },[]);
 useLayoutEffect(()=>{
  if(!enabled){clear();return}
  if(held.current&&held.current.chatId!==chatId){clear();return}
  if(targetId){
   if(!held.current)begin(targetId);
   const saved=held.current;if(!saved)return;saved.seenLive=true;current.current.pauseFollowing();
   const node=find(targetId);
   if(node&&(node!==saved.node||saved.branchId!==branchId)){
    saved.node.style.minHeight=saved.originalMinHeight;saved.node=node;saved.originalMinHeight=node.style.minHeight;saved.branchId=branchId;
    node.style.minHeight=`${saved.height}px`;position(saved,false);
   }
  }else if(held.current?.seenLive)finish();
 },[chatId,branchId,targetId,enabled]);
 return {isActive:()=>current.current.enabled&&held.current?.chatId===current.current.chatId};
}
