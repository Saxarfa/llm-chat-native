import {Component,startTransition,useCallback,useEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {flushSync} from 'react-dom';
import type {Message} from './types';

const tail=4,batch=4;
type Window={key:string;first:string;last:string;start:number;end:number;tailOpen:boolean;pending?:boolean};
const rowId=(message:Message|undefined,index:number)=>message?.id||`msg-${index}`;
export function initialHistoryStart(messages:readonly Message[],large:boolean){
 if(!large)return 0;
 let count=0;
 for(let i=messages.length-1;i>=0;i--)if(messages[i].role!=='system'&&++count===tail)return i;
 return 0;
}

export function initialHistoryWindow(messages:readonly Message[],large:boolean,targetId?:string){
 const target=targetId?messages.findIndex((message,index)=>rowId(message,index)===targetId):-1;
 if(!large)return {start:0,end:messages.length};
 if(target<0)return {start:initialHistoryStart(messages,true),end:messages.length};
 let start=target,end=target+1,count=0;
 for(let i=target-1;i>=0;i--){start=i;if(messages[i].role!=='system'&&++count===4)break}
 count=0;
 for(let i=target+1;i<messages.length;i++){end=i+1;if(messages[i].role!=='system'&&++count===8)break}
 return {start,end};
}

const historyWindow=(key:string,messages:readonly Message[],start:number,end:number):Window=>({key,start,end,first:rowId(messages[start],start),last:rowId(messages[end-1],end-1),tailOpen:end===messages.length,pending:messages.length===0});

// Only the first paint is partial. Older rows stay mounted after preparation,
// preserving native selection, disclosure state and browser text search.
export function useConversationHistory(key:string,messages:readonly Message[],large:boolean,scroll:RefObject<HTMLDivElement|null>,enabled:boolean,targetId?:string,canPrepare=()=>true){
 const prepareAllowed=useRef(canPrepare);prepareAllowed.current=canPrepare;
 const initial=()=>{const {start,end}=initialHistoryWindow(messages,large,targetId);return historyWindow(key,messages,start,end)};
 const [saved,setSaved]=useState<Window>(initial);
 let current=saved;
 if(saved.key!==key||saved.pending&&messages.length>0){current=initial();setSaved(current)}
 const found=messages.findIndex((message,index)=>rowId(message,index)===current.first);
 let start=found>=0?found:Math.min(current.start,Math.max(0,messages.length-1));
 const last=messages.findIndex((message,index)=>rowId(message,index)===current.last);
 let end=current.tailOpen?messages.length:last>=0?last+1:Math.min(current.end,messages.length);
 const target=targetId?messages.findIndex((message,index)=>rowId(message,index)===targetId):-1;
 if(!large||target>=0&&(target<start||target>=end)){start=large?Math.min(start,target):0;end=large?Math.max(end,target+1):messages.length;current=historyWindow(key,messages,start,end);if(saved.start!==start||saved.end!==end||saved.key!==key||saved.first!==current.first||saved.last!==current.last)setSaved(current)}
 const reveal=useCallback((index=0)=>{
  const next=Math.max(0,index);
  setSaved(previous=>{
   if(previous.key!==key)return previous;
   const at=messages.findIndex((message,i)=>rowId(message,i)===previous.first);
   const from=at<0?previous.start:at,tail=previous.tailOpen?messages.length:messages.findIndex((message,i)=>rowId(message,i)===previous.last)+1;
   if(next>=from&&next<tail)return previous;
   return historyWindow(key,messages,Math.min(from,next),Math.min(messages.length,Math.max(tail,next+1)));
  });
 },[key,messages]);
 const revealAll=useCallback(()=>setSaved(previous=>previous.key===key?historyWindow(key,messages,0,messages.length):previous),[key,messages]);
 useEffect(()=>{
  if(!enabled||start===0&&end===messages.length)return;
  let cancelled=false,id=0,retry=0;
  const schedule=()=>{if(typeof window.requestIdleCallback==='function')id=window.requestIdleCallback(prepare,{timeout:120});else id=window.setTimeout(prepare,16)};
  const prepare=()=>{
   if(cancelled)return;
   // Prepending moves the scroll coordinate system. Wait until a send/jump
   // animation has finished using its captured starting position.
   if(!prepareAllowed.current()){retry=window.setTimeout(schedule,80);return}
   startTransition(()=>setSaved(previous=>{
    if(previous.key!==key)return previous;
    // An urgent jump/search can reveal more rows before this concurrent
    // update commits. Preparation only widens that window; never remount it.
    const first=messages.findIndex((message,index)=>rowId(message,index)===previous.first);
    const last=messages.findIndex((message,index)=>rowId(message,index)===previous.last);
    const from=first>=0?first:previous.start,to=previous.tailOpen?messages.length:last>=0?last+1:previous.end;
    return historyWindow(key,messages,Math.max(0,Math.min(from,start-batch)),Math.min(messages.length,Math.max(to,end+batch)));
   }));
  };
  schedule();
  return()=>{cancelled=true;clearTimeout(retry);if(typeof window.cancelIdleCallback==='function')window.cancelIdleCallback(id);else clearTimeout(id)};
 },[enabled,key,start,end,messages]);
 useEffect(()=>{
  if(!enabled||start===0&&end===messages.length)return;
  const all=()=>flushSync(revealAll);
  const keydown=(event:KeyboardEvent)=>{
   const key=event.key.toLowerCase();
   if(!(event.ctrlKey||event.metaKey)||!['f','a'].includes(key))return;
   if(key==='a'&&event.target instanceof Element&&event.target.closest('input,textarea,[contenteditable=true]'))return;
   all();
  };
  window.addEventListener('keydown',keydown,true);
  const container=scroll.current;container?.addEventListener('selectstart',all);
  return()=>{window.removeEventListener('keydown',keydown,true);container?.removeEventListener('selectstart',all)};
 },[enabled,start,end,messages.length,revealAll,scroll]);
 return{start,end,reveal,revealAll};
}

type Anchor={distance:number;prepend:boolean;row?:{id:string;top:number}}|null;
type Props={conversationKey:string;start:number;end?:number;suspended?:boolean;scroll:RefObject<HTMLDivElement|null>;onAdjust?:(top:number)=>void;children:ReactNode};
// Capture immediately before DOM mutations, so scrolling between an idle task
// and a concurrent commit cannot be mistaken for a layout shift.
export class HistoryScrollAnchor extends Component<Props,object,Anchor>{
 getSnapshotBeforeUpdate(previous:Props):Anchor{
  // Sending/jumping already has a scroll owner. An additional reading snapshot
  // both competes with it and forces layout in the middle of the React commit.
  if(this.props.suspended)return null;
  if(previous.conversationKey!==this.props.conversationKey||this.props.start===previous.start&&this.props.end===previous.end)return null;
  const scroll=this.props.scroll.current;
  // Scroll coordinates exclude Motion transforms and don't force skipped
  // message descendants to lay out. Native anchoring may already have moved
  // scrollTop when we commit; assigning the absolute target avoids doubling it.
  if(!scroll)return null;
  const viewport=scroll.getBoundingClientRect?.(),rows=scroll.querySelectorAll?.<HTMLElement>('.message[data-message-id]');
  const visible=viewport&&rows?[...rows].find(row=>{const rect=row.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom}):undefined;
  return {distance:scroll.scrollHeight-scroll.scrollTop,prepend:this.props.start<previous.start,row:visible?{id:visible.dataset.messageId!,top:visible.getBoundingClientRect().top}:undefined};
 }
 componentDidUpdate(_previous:Props,_state:object,snapshot:Anchor){
  const scroll=this.props.scroll.current;
  if(!snapshot||!scroll)return;
  const row=snapshot.row?[...(scroll.querySelectorAll?.<HTMLElement>('.message[data-message-id]')||[])].find(row=>row.dataset.messageId===snapshot.row!.id):undefined;
  const target=row&&snapshot.row?scroll.scrollTop+row.getBoundingClientRect().top-snapshot.row.top:snapshot.prepend?scroll.scrollHeight-snapshot.distance:scroll.scrollTop;
  if(Math.abs(target-scroll.scrollTop)>.5)scroll.scrollTop=target;
  // This is layout compensation, not a deliberate downward scroll. Update
  // the scroll owner's baseline before the browser delivers its scroll event.
  this.props.onAdjust?.(scroll.scrollTop);
 }
 render(){return this.props.children}
}
