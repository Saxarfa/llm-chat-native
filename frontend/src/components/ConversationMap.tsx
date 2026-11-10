import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import type {Message,Values} from '../types';
import {modelName} from '../domain';
import {observeConversationVisibility} from '../conversationVisibility';
import './ConversationMap.css';

type Turn={id:string;ids:string[];question:string;model:string;size:number;error:boolean};
type Marker={turn:Turn;ids:string[];start:number;end:number;size:number;error:boolean};
const excerpt=(text:string)=>text.slice(0,700).replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#*`>_]/g,'').replace(/\s+/g,' ').trim().slice(0,200);

export function ConversationMap({container,messages,settings,onNavigate}:{container:RefObject<HTMLDivElement|null>;messages:Message[];settings:Values;onNavigate:(id:string)=>void}){
 const reduced=useReducedMotion(),tooltipId=useId();
 const [visible,setVisible]=useState<Set<string>>(()=>new Set()),[preview,setPreview]=useState<number|null>(null),[moving,setMoving]=useState(false);
 const [availableHeight,setAvailableHeight]=useState(360),[previewHeight,setPreviewHeight]=useState(112);
 const nav=useRef<HTMLElement>(null),tooltip=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const turns=useMemo(()=>{
  const result:Turn[]=[];
  messages.forEach((message,index)=>{
   if(message.role==='system')return;
   const id=message.id||`msg-${index}`;
   if(message.role==='user'||!result.length)result.push({id,ids:[],question:excerpt(message.content)||(message.attachments?.length?'Сообщение с изображением':'Начало разговора'),model:'',size:0,error:false});
   const turn=result[result.length-1];turn.ids.push(id);
   if(message.role==='assistant'){
    if(!turn.model)turn.model=modelName(message.model||'',settings);
    turn.size+=message.content?.length||0;
    turn.error ||= !!message.metrics?.error;
   }
  });
  return result;
 },[messages,settings]);
 const signature=messages.map(m=>m.id).join('|');
 useEffect(()=>{
  const el=container.current;if(!el)return;
  setVisible(new Set());
  const disconnect=observeConversationVisibility(el,setVisible);
  const scroll=()=>{setMoving(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setMoving(false),700)};
  el.addEventListener('scroll',scroll,{passive:true});
  return()=>{disconnect();el.removeEventListener('scroll',scroll);clearTimeout(timer.current)};
 },[container,signature]);
 useLayoutEffect(()=>{
  const el=nav.current;if(!el)return;
  let frame=0;const measure=()=>setAvailableHeight(el.clientHeight);
  measure();const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure()})});observer.observe(el);
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[turns.length>0]);
 const limit=Math.min(420,Math.max(32,availableHeight));
 const capacity=Math.max(1,Math.floor((limit-16)/16));
 const markers=useMemo<Marker[]>(()=>{
  const count=Math.min(turns.length,capacity),result:Marker[]=[];
  for(let i=0;i<count;i++){
   const start=Math.floor(i*turns.length/count),end=Math.floor((i+1)*turns.length/count),items=turns.slice(start,end);
   result.push({turn:items[0],ids:items.flatMap(turn=>turn.ids),start,end,size:Math.max(...items.map(turn=>turn.size)),error:items.some(turn=>turn.error)});
  }
  return result;
 },[turns,capacity]);
 const trackHeight=Math.min(limit,markers.length*16+16),slot=(trackHeight-16)/Math.max(1,markers.length);
 const current=markers.map((marker,index)=>marker.ids.some(id=>visible.has(id))?index:-1).filter(index=>index>=0);
 const first=current[0],last=current.at(-1);
 useEffect(()=>{setPreview(null)},[signature,capacity]);
 const selected=preview===null?undefined:markers[preview];
 useLayoutEffect(()=>{
  const el=tooltip.current;if(!el)return;
  let frame=0;const measure=()=>setPreviewHeight(el.offsetHeight);
  measure();const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure()})});observer.observe(el);
  return()=>{observer.disconnect();cancelAnimationFrame(frame)};
 },[!!selected]);
 const previewTop=Math.max(0,Math.min(availableHeight-previewHeight,(availableHeight-trackHeight)/2+8+((preview??0)+.5)*slot-previewHeight/2));
 if(!markers.length)return null;
 return <nav ref={nav} className={`conversation-map${moving?' is-moving':''}`} aria-label="Карта переписки" onMouseLeave={()=>setPreview(null)}>
  <div className="conversation-map-track" style={{height:trackHeight}}>
   <div className="conversation-map-viewport" aria-hidden="true" style={{transform:`translateY(${first===undefined?8:8+first*slot}px)`,height:first===undefined?slot:(last!-first+1)*slot,opacity:first===undefined?0:1}}/>
   {markers.map((marker,index)=>{
    const active=current.includes(index),range=marker.end-marker.start>1;
    const label=`${range?'Вопросы':'Вопрос'} ${marker.start+1}${range?`–${marker.end}`:''} из ${turns.length}`;
    return <button type="button" key={marker.turn.id} className={`conversation-map-marker${active?' is-visible':''}${first!==undefined&&index<first?' is-before':''}${preview===index?' is-preview':''}`} aria-label={`${label}. ${marker.turn.question}`} aria-current={active?'location':undefined} aria-describedby={preview===index?tooltipId:undefined}
     onMouseEnter={()=>setPreview(index)} onFocus={()=>setPreview(index)} onBlur={()=>setPreview(null)} onClick={()=>{onNavigate(marker.turn.id);setPreview(null)}}
     onKeyDown={event=>{
      const target=event.key==='Home'?0:event.key==='End'?markers.length-1:event.key==='ArrowDown'?Math.min(markers.length-1,index+1):event.key==='ArrowUp'?Math.max(0,index-1):undefined;
      if(target!==undefined){event.preventDefault();nav.current?.querySelectorAll<HTMLButtonElement>('.conversation-map-marker')[target]?.focus({preventScroll:true})}
      if(event.key==='Escape'){event.preventDefault();setPreview(null)}
     }}>
     <span className="conversation-map-tick" aria-hidden="true" style={{width:Math.round(9+Math.min(12,Math.log2(1+marker.size/180)*2.4))}}/>
    </button>;
   })}
  </div>
  <AnimatePresence initial={false}>{selected&&<motion.div ref={tooltip} id={tooltipId} role="tooltip" className="conversation-map-preview" style={{top:previewTop}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.14}}>
   <div className="conversation-map-preview-meta"><span>{selected.end-selected.start>1?`Вопросы ${selected.start+1}–${selected.end}`:`Вопрос ${selected.start+1}`} <span>из {turns.length}</span></span>{selected.error&&<span className="conversation-map-preview-error">Ошибка ответа</span>}</div>
   <div className="conversation-map-preview-question">{selected.turn.question}</div>
   {selected.turn.model&&<div className="conversation-map-preview-model">{selected.turn.model}</div>}
  </motion.div>}</AnimatePresence>
 </nav>;
}
