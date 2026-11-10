import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Columns2,Loader2} from '../icons';
import {IconButton} from './primitives';
import {StudioThumbnail} from './StudioHistory';
import {useReducedMotion} from '../useReducedMotion';
import type {StudioJob} from './studioTypes';
import './StudioArtDetails.css';

export function StudioFilmstrip({jobs,selected,loading,onSelect,onCompare,heading='Последние арты',showLatest=true,maxItems=12}:{jobs:StudioJob[];selected?:string;loading?:string;onSelect:(job:StudioJob)=>void;onCompare?:(source:HTMLButtonElement)=>void;heading?:string;showLatest?:boolean;maxItems?:number}){
 const track=useRef<HTMLDivElement>(null),reduced=useReducedMotion();
 const [edges,setEdges]=useState({start:true,end:true});
 const recent=jobs.slice(0,maxItems),chosen=jobs.find(job=>job.id===selected);
 // Keep a selected older result reachable when new generations enter the strip.
 const shown=chosen&&!recent.some(job=>job.id===chosen.id)?[...recent.slice(0,Math.max(0,maxItems-1)),chosen]:recent;
 const order=shown.map(job=>job.id).join(',');
 useEffect(()=>{
  const el=track.current;if(!el)return;
  const measure=()=>{const next={start:el.scrollLeft<2,end:el.scrollLeft+el.clientWidth>=el.scrollWidth-2};setEdges(value=>value.start===next.start&&value.end===next.end?value:next)};
  const wheel=(event:WheelEvent)=>{
   if(event.ctrlKey||event.metaKey||el.scrollWidth<=el.clientWidth||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
   event.preventDefault();event.stopPropagation();el.scrollLeft+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?el.clientWidth:1);
  };
  const observer=new ResizeObserver(measure);observer.observe(el);measure();
  el.addEventListener('scroll',measure,{passive:true});el.addEventListener('wheel',wheel,{passive:false});
  return()=>{observer.disconnect();el.removeEventListener('scroll',measure);el.removeEventListener('wheel',wheel)};
 },[order]);
 const reveal=(button:HTMLElement)=>{
  const el=track.current;if(!el)return;
  // Local coordinates keep scroll distance correct under workspace zoom.
  const left=button.offsetLeft,right=left+button.offsetWidth;
  if(left<el.scrollLeft)el.scrollTo({left:left-3,behavior:reduced?'instant':'smooth'});
  else if(right>el.scrollLeft+el.clientWidth)el.scrollTo({left:right-el.clientWidth+3,behavior:reduced?'instant':'smooth'});
 };
 useEffect(()=>{const active=track.current?.querySelector<HTMLElement>('[aria-pressed=true]');if(active)reveal(active)},[selected,order]);
 if(!jobs.length)return null;
 return <section className="studio-filmstrip" aria-label={heading}>
  <div className="studio-filmstrip-heading"><span>{heading}</span><div>
   {showLatest&&selected&&selected!==jobs[0].id&&<button type="button" className="studio-latest-art" onClick={()=>onSelect(jobs[0])}>К последнему</button>}
   {onCompare&&<button type="button" className="studio-compare-trigger" aria-label="Сравнить арты" disabled={jobs.length<2||!selected} onClick={event=>onCompare(event.currentTarget)}><Columns2 size={14}/>Сравнить</button>}
   <IconButton label="Прокрутить арты влево" disabled={edges.start} onClick={()=>track.current?.scrollBy({left:-Math.max(80,track.current.clientWidth*.7),behavior:reduced?'instant':'smooth'})}><ChevronLeft size={14}/></IconButton>
   <IconButton label="Прокрутить арты вправо" disabled={edges.end} onClick={()=>track.current?.scrollBy({left:Math.max(80,track.current.clientWidth*.7),behavior:reduced?'instant':'smooth'})}><ChevronRight size={14}/></IconButton>
  </div></div>
  <div ref={track} className="studio-filmstrip-track" role="group" aria-label="Выбрать арт для просмотра" onKeyDown={event=>{
   const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.studio-filmstrip-item'));
   const index=buttons.indexOf(event.target as HTMLButtonElement);if(index<0||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();event.stopPropagation();
   const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowRight'?1:-1)));
   buttons[next].focus({preventScroll:true});reveal(buttons[next]);onSelect(shown[next]);
  }}>
   {shown.map((job,index)=><button key={job.id} type="button" className="studio-filmstrip-item" aria-label={index===0?'Показать последний арт':`Показать арт ${jobs.length-jobs.indexOf(job)}`} aria-pressed={selected===job.id} aria-busy={loading===job.id} tabIndex={selected===job.id||(!selected&&index===0)?0:-1} onClick={()=>onSelect(job)}>
    <StudioThumbnail job={job}/>{loading===job.id&&<span className="studio-filmstrip-loading"><Loader2 size={16} className="spin"/></span>}
   </button>)}
  </div>
 </section>;
}
