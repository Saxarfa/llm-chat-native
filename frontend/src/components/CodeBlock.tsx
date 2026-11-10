import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {HintButton} from './Hint';
import {cloneElement,isValidElement,memo,useId,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ChevronDown,Download,MoreHorizontal} from '../icons';
import {useReducedMotion} from '../useReducedMotion';
import {CopyButton} from './primitives';
import {download} from '../store';
import {motionDuration,motionEase} from '../motion';
import {observedHeight} from '../observedHeight';
import {copyBlockLabel} from '../copyBlock';
import './CopyBlock.css';
const extensions:Record<string,string>={python:'py',py:'py',javascript:'js',js:'js',typescript:'ts',ts:'ts',tsx:'tsx',jsx:'jsx',bash:'sh',shell:'sh',sh:'sh',powershell:'ps1',html:'html',css:'css',json:'json',yaml:'yaml',yml:'yml',sql:'sql',java:'java',c:'c',cpp:'cpp',csharp:'cs',cs:'cs',go:'go',rust:'rs',ruby:'rb',php:'php',swift:'swift',kotlin:'kt',xml:'xml',markdown:'md',dockerfile:'dockerfile'};
function LineNumbers({count,start=1}:{count:number;start?:number}){return <span className="code-line-numbers" aria-hidden="true">{Array.from({length:count},(_,index)=><span key={index}>{index+start}</span>)}</span>}

export const CodeBlock=memo(function CodeBlock({children}:{children?:ReactNode}){
 const child=isValidElement<{children?:ReactNode;className?:string}>(children)?children:null;
 const code=String(child?.props.children??'').replace(/\n$/,''),rawLanguage=/language-(\S+)/.exec(child?.props.className||'')?.[1]||'',textLabel=copyBlockLabel(rawLanguage),textBlock=!!textLabel,language=textLabel||rawLanguage||'Код';
 const extension=extensions[language.toLowerCase()]||'txt';
 const leadingBlank=code.match(/^(?:[\t ]*\r?\n)+/)?.[0]||'',skipped=leadingBlank.split('\n').length-1,displayCode=code.slice(leadingBlank.length);
 const lines=code?code.split('\n').length:0,visibleLines=Math.max(0,lines-skipped),long=visibleLines>10&&(!textBlock||textLabel==='Текст');
 const [expanded,setExpanded]=useState<boolean>(),bodyId=useId(),open=!long||expanded===true;
 const codeLines=displayCode.split('\n'),nonempty=codeLines.map((line,index)=>line.trim()?index:-1).filter(index=>index>=0).slice(0,6);
 const previewEnd=nonempty.at(-1)??0,fadeStart=nonempty[Math.max(0,nonempty.length-2)]??0;
 const body=useRef<HTMLPreElement>(null),reveal=useRef<HTMLDivElement>(null),animation=useRef<Animation|null>(null),resize=useRef<ResizeObserver|null>(null),mounted=useRef(false),reduced=useReducedMotion();
 useLayoutEffect(()=>{
  const element=reveal.current;if(!element)return;
  const from=mounted.current?parseFloat(getComputedStyle(element).height):0;
  animation.current?.cancel();animation.current=null;resize.current?.disconnect();resize.current=null;
  element.style.height=long&&!open?'calc(32px + var(--code-preview-lines) * var(--code-row-height))':'auto';
  // Keep natural height between user actions. Measuring and transitioning every
  // streamed code line makes the block continually chase its own content.
  if(mounted.current&&!reduced){
   const to=parseFloat(getComputedStyle(element).height);
   if(Math.abs(from-to)>.5){
    const duration=1000*(open?motionDuration.detail:motionDuration.exit),deadline=performance.now()+duration;
    const start=(startHeight:number,endHeight:number,time:number)=>{
     const next=element.animate([{height:`${startHeight}px`},{height:`${endHeight}px`}],{duration:time,easing:`cubic-bezier(${motionEase.join(',')})`});
     animation.current=next;next.onfinish=()=>{if(animation.current===next){animation.current=null;resize.current?.disconnect();resize.current=null}};
    };
    start(from,to,duration);
    // Observe only during the brief opening transition. If code arrives or
    // wraps meanwhile, retarget its remaining time instead of jumping at the
    // end or extending the animation for every token.
    if(open&&body.current){
     let target=to;
     resize.current=new ResizeObserver(entries=>{
      const entry=entries[0];if(!entry||!animation.current)return;
      const next=observedHeight(entry);if(Math.abs(next-target)<.5)return;target=next;
      const current=parseFloat(getComputedStyle(element).height),remaining=deadline-performance.now();
      animation.current.cancel();animation.current=null;
      if(remaining>0)start(current,next,remaining);else{resize.current?.disconnect();resize.current=null}
     });resize.current.observe(body.current);
    }
   }
  }
  mounted.current=true;
 },[open,long,reduced]);
 useLayoutEffect(()=>()=>{animation.current?.cancel();resize.current?.disconnect()},[]);
 const numberStyle={'--code-number-width':`${Math.max(2,String(lines).length)}ch`} as CSSProperties;
 const revealStyle={'--code-preview-lines':previewEnd+1,'--code-fade-lines':previewEnd-fadeStart+1,transition:'none'} as CSSProperties;
 const copyLabel=textLabel==='Промпт'?'Скопировать промпт':textLabel==='Негативный промпт'?'Скопировать негативный промпт':textLabel==='Системный промпт'?'Скопировать системный промпт':textBlock?'Скопировать текст':'Скопировать код';
 const toggle=()=>{
  if(open){
   const panel=body.current?.closest('.code-panel'),scroll=panel?.closest('.message-scroll'),heading=panel?.querySelector('.code-heading');
   if(panel&&scroll&&heading){
    const offset=panel.getBoundingClientRect().top-heading.getBoundingClientRect().top;
    // When collapsing from a pinned header, keep that header in view instead
    // of leaving the viewport far below the now-shortened code block.
    if(offset < -1)scroll.scrollTop+=offset;
   }
  }
  setExpanded(!open);
 };
 return <div className={`code-block code-panel${textBlock?' text-panel':''}`} data-expanded={long&&open?true:undefined}>
  <div className="code-heading">
   <span className="code-caption"><span>{language}</span>{!textBlock&&<span className="code-file-format">.{extension}</span>}{long&&<small>{lines} строк</small>}</span>
   <div className="code-heading-actions">
    {long&&<HintButton className="code-spoiler-button" aria-label={open?`Свернуть ${textBlock?'текст':'код'}`:`Показать ${textBlock?'текст':'код'} полностью`} hint={open?'Свернуть':'Показать полностью'} aria-expanded={open} aria-controls={bodyId} onClick={toggle}><ChevronDown size={14} className={open?'rotated':''}/></HintButton>}
    <CopyButton text={code} label={copyLabel} showLabel={textBlock}/>
    <DropdownMenu>
     <DropdownMenuTrigger asChild><HintButton className="code-menu-trigger" aria-label="Другие действия" hint="Другие действия"><MoreHorizontal size={16}/></HintButton></DropdownMenuTrigger>
     <DropdownMenuContent align="end" sideOffset={6}>
      <DropdownMenuItem onSelect={()=>download(code+'\n',`${textBlock?rawLanguage||'text':'code'}.${extension}`,'text/plain;charset=utf-8')}><Download size={14}/>{textBlock?'Скачать текст':'Скачать код'}</DropdownMenuItem>
     </DropdownMenuContent>
    </DropdownMenu>
   </div>
  </div>
  <div ref={reveal} id={bodyId} className={`code-reveal${long?' code-preview':''}${open?' code-expanded':''}`} style={revealStyle}>
   <pre ref={body} className={`code-body ${textBlock?'text-body':'numbered-code'}`} style={numberStyle}>{!textBlock&&<LineNumbers count={visibleLines} start={skipped+1}/>}{textBlock?<code>{displayCode}</code>:child?cloneElement(child,{},displayCode):children}</pre>
  </div>
 </div>;
});
