import {createContext,useMemo,useRef,useState} from 'react';
import {Popover} from 'radix-ui';
import {ArrowUpRight,BookOpen,ChevronRight,X} from '../icons';
import {safeUrl} from '../domain';
import type {Message} from '../types';
import {KnowledgeSourcePreview} from './KnowledgeSettings';
import type {Source} from '../types';
import {sourceHost,sourceHostLine,sourceIconUrl,sourceNote,sourceTitle} from '../webSources';

export const AnswerSourcesContext=createContext<Message['sources']>(undefined);
function SourceImage({source}:{source:Source}){
 const[failed,setFailed]=useState(false);
 const icon=sourceIconUrl(source),letter=sourceHost(source).slice(0,1).toUpperCase()||'•';
 return <span className="source-site-image" aria-hidden="true">{source.kind==='knowledge'?<BookOpen size={14}/>:icon&&!failed?<img src={icon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>{letter}</span>}</span>;
}
function SourceRow({source,number,selected,onKnowledge}:{source:Source;number:number;selected:boolean;onKnowledge:(source:Source)=>void}){
 const host=sourceHost(source),hostLine=sourceHostLine(source,host),note=sourceNote(source);
 const content=<>
  <span className={`source-row-number ${number>=100?'three-digits':''}`}>{number}</span>
  <SourceImage key={sourceIconUrl(source)} source={source}/>
  <div><strong>{sourceTitle(source,host)}</strong>{hostLine&&<span>{hostLine}</span>}{note&&<small>{note}</small>}</div>
  <ArrowUpRight size={14} aria-hidden="true"/>
 </>;
 return source.kind==='knowledge'
  ?<button type="button" className="knowledge-source-action" aria-current={selected||undefined} onClick={()=>onKnowledge(source)}>{content}</button>
  :<a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer" aria-current={selected||undefined}>{content}</a>;
}
export function AnswerSources({sources,index,indices,inline=false}:{sources:NonNullable<Message['sources']>;index?:number;indices?:number[];inline?:boolean}){
 const[open,setOpen]=useState(false),[preview,setPreview]=useState<Source|null>(null),panel=useRef<HTMLDivElement>(null);
 const selected=useMemo(()=>[...new Set(indices|| (index!=null?[index]:[]))].filter(i=>Number.isInteger(i)&&i>=0&&i<sources.length),[indices,index,sources.length]);
 const entries=useMemo(()=>sources.map((source,i)=>({source,i})).filter(({i})=>!inline||selected.includes(i)),[sources,inline,selected]);
 // Up to three distinct sites for the stack; sources whose real host is unknown share one slot.
 const sites=useMemo(()=>{
  const seen=new Set<string>(),result:Source[]=[];
  for(const source of sources){
   const key=source.kind==='knowledge'?'knowledge':sourceHost(source)||'unknown';
   if(seen.has(key))continue;
   seen.add(key);result.push(source);
   if(result.length===3)break;
  }
  return result;
 },[sources]);
 const number=entries.length;
 if(!number)return null;
 return <><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button className={`${inline?'sources-count is-inline':'sources-summary'} ${number>=100?'three-digits':''}`} aria-label={inline?`Показать источники фрагмента: ${number}`:`Показать источники ответа: ${number}`} >{inline?number:<><span className="sources-site-stack">{sites.map((s,k)=><SourceImage key={(s.kind==='knowledge'?'knowledge':sourceHost(s))+k} source={s}/>)}</span><span>Источники</span><span className={`sources-count ${number>=100?'three-digits':''}`}>{number}</span><ChevronRight size={14}/></>}</button></Popover.Trigger><Popover.Portal><Popover.Content ref={panel} className="answer-sources-popover" side="top" align={inline?'center':'start'} sideOffset={9} collisionPadding={12} avoidCollisions onOpenAutoFocus={e=>{e.preventDefault();panel.current?.focus({preventScroll:true});const list=panel.current?.querySelector<HTMLElement>('.answer-sources-list'),row=panel.current?.querySelector<HTMLElement>('[data-selected=true]');if(list&&row)list.scrollTop=row.getBoundingClientRect().top-list.getBoundingClientRect().top-8}} tabIndex={-1} aria-label={inline?'Источники этого фрагмента':'Источники этого ответа'}>
  <header><div><strong>{inline?'Источники фрагмента':'Источники ответа'} <span>{number}</span></strong></div><Popover.Close className="sources-close" aria-label="Закрыть источники"><X size={16}/></Popover.Close></header>
  <ol className="answer-sources-list">{entries.map(({source,i})=><li key={source.url+i} data-selected={selected.includes(i)}><SourceRow source={source} number={i+1} selected={selected.includes(i)} onKnowledge={s=>{setOpen(false);setPreview(s)}}/></li>)}</ol>
 </Popover.Content></Popover.Portal></Popover.Root>{preview&&<KnowledgeSourcePreview source={preview} onClose={()=>setPreview(null)}/>}</>;
}
