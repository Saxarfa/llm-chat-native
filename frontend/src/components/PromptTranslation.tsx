import {HintButton} from './Hint';
import {useEffect,useRef,useState} from 'react';
import {Languages,Loader2,Check,X} from '../icons';
import {Button,CopyButton} from './primitives';
import {Reveal} from './Reveal';
import {translateText} from '../translation';
import {useTranslationModel} from '../useTranslationModel';
import {Select,SelectOption} from './Select';
import './Translator.css';

export function PromptTranslation({value,onApply,disabled=false}:{value:string;onApply:(text:string)=>void;disabled?:boolean}){
 const {model,models,chooseModel,name}=useTranslationModel();
 const [busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null),original=useRef(''),current=useRef(value);current.current=value;
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{request.current?.abort();request.current=null;setBusy(false);setResult('');setError('')},[value,model]);
 const translate=async()=>{
  if(busy||disabled||!value.trim()||!models.includes(model))return;
  const controller=new AbortController();request.current=controller;original.current=value;setBusy(true);setError('');setResult('');
  try{const text=await translateText(value,'ru','en','prompt',controller.signal,model);if(!controller.signal.aborted&&current.current===original.current)setResult(text)}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}
  finally{if(request.current===controller){setBusy(false);request.current=null}}
 };
 return <div className="prompt-translation">
  <div className="prompt-translation-toolbar"><Button type="button" variant="ghost" className="prompt-translate-button" disabled={disabled||!value.trim()||value.length>12000||busy||!models.includes(model)} onClick={()=>void translate()}>{busy?<Loader2 size={14} className="spin"/>:<Languages size={14}/>}<span>{busy?'Перевожу…':'На английский'}</span></Button><div className="prompt-translation-model"><Select aria-label="Модель перевода промпта" title={`Модель перевода: ${name(model)}`} displayValue={<span className="prompt-translation-model-name">{model==='gemma-4-e2b-translation'?'Gemma 4 E2B':name(model)}</span>} value={model} disabled={busy||disabled||!models.length} onChange={event=>chooseModel(event.target.value)}>{models.map(id=><SelectOption key={id} value={id}>{name(id)}</SelectOption>)}</Select></div></div>
  {busy&&<button type="button" className="translation-cancel" onClick={()=>{request.current?.abort();request.current=null;setBusy(false)}}>Отмена</button>}
  <Reveal show={!!result}><div className="prompt-translation-result"><header><strong>Английский промпт</strong><CopyButton text={result}/><HintButton type="button" aria-label="Скрыть перевод" onClick={()=>setResult('')}><X size={14}/></HintButton></header><p>{result}</p><Button type="button" variant="outline" disabled={disabled||current.current!==original.current} onClick={()=>{onApply(result);setResult('')}}><Check size={14}/>Использовать промпт</Button></div></Reveal>
  {error&&<p className="translation-error" role="alert">{error}</p>}
  {value.length>12000&&<p className="translation-error">Для перевода сократи промпт до 12 000 символов.</p>}
 </div>;
}
