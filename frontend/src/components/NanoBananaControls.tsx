import {useEffect,useId,useRef,type FocusEventHandler} from 'react';
import {attachTouchScroll} from '../touchScroll';
import {Select,SelectOption} from './Select';
import type {ImageStudioDraft} from './useImageStudioDraft';
import type {StudioAIStudioConfig} from './studioTypes';
import './NanoBananaControls.css';

export function StudioSourceTabs({source,onChange,disabled}:{source:ImageStudioDraft['source'];onChange:(source:ImageStudioDraft['source'])=>void;disabled:boolean}){
 return <div className="studio-source-tabs" role="group" aria-label="Источник генерации">{([['local','Локальные'],['aistudio','AI Studio']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={source===value} disabled={disabled} onClick={()=>onChange(value)}>{label}</button>)}</div>;
}

export function NanoBananaControls({draft,edit,config,onFocus,onBlur}:{draft:ImageStudioDraft;edit:(patch:Partial<ImageStudioDraft>)=>void;config?:StudioAIStudioConfig;onFocus?:FocusEventHandler<HTMLTextAreaElement>;onBlur?:FocusEventHandler<HTMLTextAreaElement>}){
 const textarea=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>attachTouchScroll(textarea.current),[]);
 const id=useId(),ratios=config?.aspect_ratios?.length?config.aspect_ratios:['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'],sizes=config?.image_sizes?.length?config.image_sizes:['1K'];
 return <div className="nano-banana-controls">
  <div className="nano-banana-model"><strong>{config?.name||'Nano Banana 2.1'}</strong><span>Google AI Studio</span></div>
  <label htmlFor={id}>Промпт</label><textarea ref={textarea} id={id} aria-label="Промпт Nano Banana" placeholder="Опиши, что хочешь увидеть…" value={draft.prompt} onChange={event=>edit({prompt:event.target.value})} onFocus={onFocus} onBlur={onBlur} maxLength={16000} rows={4} required/>
  <div className="nano-banana-options"><label>Формат<Select aria-label="Формат Nano Banana" value={draft.aspect_ratio} onChange={event=>edit({aspect_ratio:event.target.value})}>{ratios.map(ratio=><SelectOption key={ratio} value={ratio}>{ratio==='auto'?'Авто':ratio}</SelectOption>)}</Select></label><label>Разрешение<Select aria-label="Разрешение Nano Banana" value={draft.image_size} onChange={event=>edit({image_size:event.target.value})}>{sizes.map(size=><SelectOption key={size} value={size}>{size}</SelectOption>)}</Select></label></div>
  {config&&!config.available&&<p className="nano-banana-connection" role="status">{config.reason||(config.configured?'AI Studio сейчас недоступна. Повтори позже.':'Подключи Google AI Studio в настройках приложения.')}</p>}
 </div>;
}
