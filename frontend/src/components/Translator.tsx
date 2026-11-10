import {useEffect,useRef,useState} from 'react';
import {ArrowLeftRight,Languages,Loader2,X} from '../icons';
import {Select,SelectOption} from './Select';
import {Button,CopyButton,IconButton} from './primitives';
import {HintButton,Hint} from './Hint';
import {translateText,type Language} from '../translation';
import {useTranslationModel} from '../useTranslationModel';
import './Translator.css';

export function Translator({compact=false,languageNames=false,initialText='',initialSource='ru',autoTranslate=false,onInsert}:{compact?:boolean;languageNames?:boolean;initialText?:string;initialSource?:Language;autoTranslate?:boolean;onInsert?:(text:string,mode:'replace'|'append')=>void}={}){
 const {model,models,chooseModel,name}=useTranslationModel();
 const [source,setSource]=useState<Language>(initialSource),[text,setText]=useState(initialText),[result,setResult]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const autoStarted=useRef(false);
 const target:Language=source==='ru'?'en':'ru',request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 const cancel=()=>{request.current?.abort();request.current=null;setBusy(false)};
 const changeText=(value:string)=>{cancel();setText(value);setResult('');setError('')};
 const changeDirection=()=>{cancel();setSource(target);setText(result||text);setResult('');setError('')};
 const translate=async()=>{
  if(busy||!text.trim()||text.length>12000)return;
  const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const translated=await translateText(text,source,target,'text',controller.signal,model);if(!controller.signal.aborted)setResult(translated)}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}
  finally{if(request.current===controller){request.current=null;setBusy(false)}}
 };
 useEffect(()=>{if(autoTranslate&&model&&!autoStarted.current){autoStarted.current=true;void translate()}},[autoTranslate,model]);
 return <section className={`translator${compact?' translator-compact':''}`} aria-label="Переводчик">
  <div className="translator-toolbar"><label><span>Модель перевода</span><Select aria-label="Модель перевода" value={model} onChange={event=>{cancel();chooseModel(event.target.value);setError('')}}>{models.map(id=><SelectOption key={id} value={id}>{name(id)}</SelectOption>)}</Select></label></div>
  <div className="translator-grid">
   <div className="translator-pane"><header><strong className="translator-language" aria-label={source==='ru'?'Русский':'Английский'}><span key={source}>{languageNames?(source==='ru'?'Русский':'Английский'):(source==='ru'?'RU':'EN')}</span></strong>{text&&<IconButton label="Очистить текст" onClick={()=>changeText('')}><X size={16}/></IconButton>}</header><textarea aria-label="Текст для перевода" placeholder="Введи текст…" value={text} maxLength={12000} onChange={event=>changeText(event.target.value)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void translate()}}}/><footer><span>{text.length.toLocaleString('ru-RU')} / 12 000</span></footer></div>
   <HintButton type="button" className="translator-swap-button" aria-label="Поменять языки местами" onClick={changeDirection}><ArrowLeftRight size={16}/></HintButton>
   <div className="translator-pane translator-output"><header><strong className="translator-language" aria-label={target==='en'?'Английский':'Русский'}><span key={target}>{languageNames?(target==='en'?'Английский':'Русский'):(target==='en'?'EN':'RU')}</span></strong>{result&&<CopyButton text={result}/>}</header><div className={`translator-output-body ${result?'has-result':''}`}><textarea aria-label="Перевод" readOnly value={result} aria-busy={busy}/>{!result&&<div className="translator-empty-state">{busy?<Loader2 size={18} className="spin"/>:<Languages size={20}/>}<span>{busy?'Перевожу…':'Перевод появится здесь'}</span>{!busy&&<small>Введи текст и нажми «Перевести»</small>}</div>}</div><footer aria-live="polite">{busy?'Перевожу выбранной моделью…':result?'Перевод готов':''}</footer></div>
  </div>
  {error&&<p className="translation-error" role="alert">{error}</p>}
  <div className="translator-actions">{(()=>{const submit=<Button className="translator-submit" disabled={busy||!text.trim()||!models.includes(model)} onClick={()=>void translate()}>{busy?<Loader2 size={16} className="spin"/>:<Languages size={16}/>}<span>Перевести</span><kbd>Ctrl ↵</kbd></Button>;const reason=busy?undefined:!text.trim()?'Введи текст, который нужно перевести':text.length>12000?'Текст длиннее 12 000 символов':!models.includes(model)?'Выбери модель перевода':undefined;return reason?<Hint text={reason}><span className="hint-anchor hint-anchor-block">{submit}</span></Hint>:submit})()}{busy&&<Button variant="ghost" onClick={cancel}>Отмена</Button>}</div>
 </section>;
}
