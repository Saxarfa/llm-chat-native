import {useId,type ReactNode} from 'react';
import {Disclosure} from './primitives';
import {Select,SelectOption} from './Select';
import {isOmniModel,omniDurationsFor,omniResolutions,omniTasks,nanoOutputFormat,nanoSampling,nanoThinkingLevels} from '../domain';
import * as chat from '../store';
import type {Values} from '../types';
import './NanoChatParameters.css';

type Catalog={available?:boolean;reason?:string;aspect_ratios?:string[];image_sizes?:string[];features?:Record<string,boolean>};
const ratioLabel=(value:string)=>value==='auto'?'Авто':value;
const defaultThinking=(model:string)=>isOmniModel(model)?'high':model==='aistudio/gemini-nano-banana-2.1'?'medium':'minimal';

function Row({label,children}:{label:string;children:(labelId:string)=>ReactNode}){
 const id=useId();
 return <div className="settings-field settings-row nano-parameter-row"><span id={id}>{label}</span>{children(id)}</div>;
}
function Switch({label,hint,checked,onChange}:{label:string;hint:string;checked:boolean;onChange:(value:boolean)=>void}){
 return <label className="switch-row"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)}/></label>;
}

const stopLines=(value:string)=>value.split('\n').map(line=>line.trim()).filter(Boolean).slice(0,5);

/** Run settings of an AI Studio image model; `sampling` holds the numeric controls owned by Settings. */
export function NanoChatParameters({model,config,onChange,menuClassName,sampling}:{model:string;config:Values;onChange:(key:string,value:unknown)=>void;menuClassName?:string;sampling?:ReactNode}){
 const entry=(chat.getState().models.find(item=>item.id===model)||{}) as Catalog;
 const durations=omniDurationsFor(model),video=isOmniModel(model),resolution=omniResolutions.includes(config.nano_video_resolution)?config.nano_video_resolution:'720p',duration=durations.includes(config.nano_video_duration)?config.nano_video_duration:5;
 const features=entry.features||{},ratios=entry.aspect_ratios?.length?entry.aspect_ratios:['auto'],sizes=entry.image_sizes?.length?entry.image_sizes:['1K'];
 const task=features.video_tasks&&omniTasks.some(([value])=>value===config.nano_video_task)?config.nano_video_task:'auto';
 const taskHints:Record<string,string>={auto:'Модель выбирает задачу по вашему сообщению.',text_to_video:'Опишите сцену, движение и звук.',image_to_video:'Добавьте картинку и опишите, как её оживить.',reference_to_video:'Добавьте изображения или MP4 как образцы и опишите новую сцену.',edit:'Добавьте MP4 или используйте ролик из прошлого ответа. Размер и длительность сохраняются.',extend:'Добавьте MP4 или используйте ролик из прошлого ответа. Опишите, что произойдёт дальше.'};
 const levels=features.thinking_level?nanoThinkingLevels[model]:undefined;
 const ratio=ratios.includes(config.nano_aspect_ratio)?config.nano_aspect_ratio:'auto';
 const size=sizes.includes(config.nano_image_size)?config.nano_image_size:sizes.includes('1K')?'1K':sizes[0];
 const thinking=levels?.some(([value])=>value===config.nano_thinking)?config.nano_thinking:defaultThinking(model);
 const stops:string[]=Array.isArray(config.nano_stop_sequences)?config.nano_stop_sequences.filter((item:unknown)=>typeof item==='string'):[];
 return <>
  {entry.available===false&&<p className="settings-intro" role="status">{entry.reason||'Модель недоступна в текущем подключении AI Studio.'}</p>}
  {nanoOutputFormat(model)&&<Row label="Формат ответа">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={config.nano_response_mode==='image'?'image':'text_image'} onChange={event=>onChange('nano_response_mode',event.target.value)}><SelectOption value="text_image">С текстом</SelectOption><SelectOption value="image">Без текста</SelectOption></Select>}</Row>}
  {video&&features.video_tasks&&<><Row label="Задача видео">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={task} onChange={event=>onChange('nano_video_task',event.target.value)}>{omniTasks.map(([value,label])=><SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>}</Row><p className="settings-intro">{taskHints[task]}</p></>}
  {(!video||!['edit','extend'].includes(task))&&<Row label="Соотношение сторон">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={ratio} onChange={event=>onChange('nano_aspect_ratio',event.target.value)}>{ratios.map(value=><SelectOption key={value} value={value}>{ratioLabel(value)}</SelectOption>)}</Select>}</Row>}
  {!video&&sizes.length>1&&<Row label="Размер">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={size} onChange={event=>onChange('nano_image_size',event.target.value)}>{sizes.map(value=><SelectOption key={value} value={value}>{value}</SelectOption>)}</Select>}</Row>}
  {video&&task!=='edit'&&<>
   <Row label="Длительность">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={String(duration)} onChange={event=>onChange('nano_video_duration',Number(event.target.value))}>{durations.map(value=><SelectOption key={value} value={String(value)}>{value} с</SelectOption>)}</Select>}</Row>
   <Row label="Разрешение">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={resolution} onChange={event=>onChange('nano_video_resolution',event.target.value)}>{omniResolutions.map(value=><SelectOption key={value} value={value}>{value==='4k'?'4K':value}</SelectOption>)}</Select>}</Row>
   <p className="settings-intro">Длительность задаётся для первого ролика. При продолжении её определяет модель.</p>
  </>}
  {levels&&<Row label="Рассуждения">{id=><Select aria-labelledby={id} contentClassName={menuClassName} value={thinking} onChange={event=>onChange('nano_thinking',event.target.value)}>{levels.map(([value,label])=><SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>}</Row>}
  {features.google_search&&<Switch label="Google Search" hint="Сверяться с поиском перед рисованием" checked={config.nano_google_search!==false} onChange={value=>onChange('nano_google_search',value)}/>}
  {features.image_search&&<Switch label="Поиск по картинкам" hint="Брать найденные изображения как образцы" checked={config.nano_image_search===true} onChange={value=>onChange('nano_image_search',value)}/>}
  {sampling}
  {nanoSampling(model).textLimits&&<Row label="Стоп-последовательности">{id=><textarea aria-labelledby={id} className="prompt-textarea nano-stop-sequences" rows={2} placeholder="По одной в строке, до пяти" defaultValue={stops.join('\n')} key={model+stops.join('\n')} onBlur={event=>{const next=stopLines(event.target.value);if(next.join('\n')!==stops.join('\n'))onChange('nano_stop_sequences',next)}}/>}</Row>}
  {features.system_instruction!==false&&<Disclosure title="Инструкции для модели"><Row label="Системная инструкция">{id=><textarea aria-labelledby={id} className="prompt-textarea" placeholder={video?'Например: плавное движение камеры, естественный свет':'Например: стиль акварели, без текста на изображении'} defaultValue={config.nano_system_instruction||''} key={model+(config.nano_system_instruction||'')} maxLength={16000} onBlur={event=>{if(event.target.value!==(config.nano_system_instruction||''))onChange('nano_system_instruction',event.target.value)}}/>}</Row></Disclosure>}
 </>;
}
