import {useEffect,useId,useRef,useState,useSyncExternalStore,useImperativeHandle,type RefObject} from 'react';
import {Popover} from 'radix-ui';
import {Loader2,Pause,Play,Square,Volume2,X} from '../icons';
import {IconButton} from './primitives';
import {StateTransition} from './StateTransition';
import {Select,SelectOption} from './Select';
import {accountKey} from '../accountStorage';
import {idleSpeech,readAloud} from '../readAloud';
import './ReadAloud.css';

const voices=[['xenia','Ксения · Xenia'],['baya','Бая'],['kseniya','Ксения · Kseniya'],['aidar','Айдар'],['eugene','Евгений']];
const speeds=[.8,1,1.2,1.5];
function preference(key:string,fallback:string){try{return localStorage.getItem(accountKey(key))||fallback}catch{return fallback}}
function save(key:string,value:string){try{localStorage.setItem(accountKey(key),value)}catch{}window.dispatchEvent(new Event('tts-preferences'))}
function clock(seconds:number){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`}

export function ReadAloud({text,disabled=false,label,showLabel=false,open:controlledOpen,onOpenChange,anchor,menuAction}:{text:string;disabled?:boolean;label?:string;showLabel?:boolean;open?:boolean;onOpenChange?:(open:boolean)=>void;anchor?:RefObject<HTMLButtonElement|null>;menuAction?:RefObject<((showPanel?:boolean)=>void)|null>}){
 const owner=useId(),[internalOpen,setInternalOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const open=controlledOpen??internalOpen,setOpen=(next:boolean)=>{setInternalOpen(next);onOpenChange?.(next)};
 const[voice,setVoice]=useState(()=>{const value=preference('tts-voice','xenia');return voices.some(([id])=>id===value)?value:'xenia'});
 const[rate,setRate]=useState(()=>{const value=Number(preference('tts-rate','1'));return speeds.includes(value)?value:1});
 const state=useSyncExternalStore(readAloud.subscribe,()=>{const state=readAloud.snapshot();return state.owner===owner?state:idleSpeech});
 useEffect(()=>()=>readAloud.stop(owner),[owner,text]);
 useEffect(()=>{
  const sync=()=>{const nextVoice=preference('tts-voice','xenia'),nextRate=Number(preference('tts-rate','1'));if(voices.some(([id])=>id===nextVoice)){if(nextVoice!==voice)readAloud.stop(owner);setVoice(nextVoice)}if(speeds.includes(nextRate)){setRate(nextRate);if(readAloud.snapshot().owner===owner)readAloud.rate(nextRate)}};
  window.addEventListener('tts-preferences',sync);return()=>window.removeEventListener('tts-preferences',sync);
 },[owner,voice]);
 const start=()=>void readAloud.start(owner,text,voice,rate);
 // Unlock playback within the menu's original user gesture on iOS. The
 // player stays mounted when that menu closes, retaining its audio owner.
 useImperativeHandle(menuAction,()=>(showPanel=true)=>{if(disabled||!text.trim())return;if(showPanel)setOpen(true);if(['idle','error'].includes(state.phase))start()},[disabled,text,state.phase,owner,voice,rate,onOpenChange]);
 const running=state.phase==='loading',playing=state.phase==='playing',prepared=['playing','paused','ready'].includes(state.phase);
 const changeVoice=(next:string)=>{readAloud.stop(owner);setVoice(next);save('tts-voice',next)};
 const changeRate=(next:number)=>{setRate(next);save('tts-rate',String(next));if(state.owner===owner)readAloud.rate(next)};
 return <Popover.Root open={open} onOpenChange={setOpen}><>{anchor?<Popover.Anchor virtualRef={anchor}/>:<Popover.Trigger asChild><IconButton ref={trigger} label={label||(playing?'Управление озвучкой':'Озвучить ответ')} disabled={disabled||!text.trim()} className={state.owner===owner?'tts-active':''} onClick={()=>{if(!open&&['idle','error'].includes(state.phase))start()}}>{running?<Loader2 size={14} className="spin"/>:<Volume2 size={14}/>}{showLabel&&<span>{label||'Озвучить'}</span>}</IconButton></Popover.Trigger>}</><Popover.Portal><Popover.Content className="tts-panel" side="top" align="start" sideOffset={9} collisionPadding={12} sticky="always" hideWhenDetached onOpenAutoFocus={event=>{if(!anchor)event.preventDefault()}} onCloseAutoFocus={event=>{if(anchor){event.preventDefault();anchor.current?.focus({preventScroll:true});return}const rect=trigger.current?.getBoundingClientRect();if(rect&&(rect.bottom<0||rect.top>window.innerHeight))event.preventDefault()}}>
  <header><div><Volume2 size={16}/><strong>Озвучка</strong><small>Silero · локально</small></div><Popover.Close asChild><IconButton label="Закрыть озвучку"><X size={14}/></IconButton></Popover.Close></header>
  <label>Голос<Select aria-label="Голос озвучки" value={voice} onChange={event=>changeVoice(event.target.value)}>{voices.map(([id,label])=><SelectOption key={id} value={id}>{label}</SelectOption>)}</Select></label>
  <div className="tts-speed"><span>Скорость</span><div role="group" aria-label="Скорость озвучки">{speeds.map(value=><button type="button" key={value} aria-pressed={rate===value} onClick={()=>changeRate(value)}>{String(value).replace('.',',')}×</button>)}</div></div>
  {prepared&&<div className="tts-progress"><input aria-label="Позиция озвучки" type="range" min={0} max={state.duration||1} step={.1} value={Math.min(state.time,state.duration||1)} disabled={!state.duration} onChange={event=>readAloud.seek(Number(event.target.value))}/><div><span>{clock(state.time)}</span><span>{clock(state.duration)}</span></div></div>}
  <div className="tts-controls"><button type="button" className="tts-play" onClick={()=>prepared?void readAloud.toggle():running?readAloud.stop(owner):start()}><StateTransition stateKey={running?'loading':playing?'pause':'play'} className="is-icon">{running?<Loader2 size={14} className="spin"/>:playing?<Pause size={14}/>:<Play size={14}/>}</StateTransition>{running?'Отменить подготовку':playing?'Пауза':state.phase==='paused'?'Продолжить':'Слушать'}</button>{prepared&&<IconButton label="Остановить озвучку" onClick={()=>readAloud.stop(owner)}><Square size={14}/></IconButton>}</div>
  {running&&<p role="status">Готовлю запись на процессоре…</p>}{state.error&&<p role="alert" className="tts-error">{state.error}</p>}
 </Popover.Content></Popover.Portal></Popover.Root>;
}
