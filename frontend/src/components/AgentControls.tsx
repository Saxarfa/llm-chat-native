import {useEffect,useState} from 'react';
import {Brain,ChevronDown,Eye,File,ShieldCheck,Shield, X} from '../icons';
import {reasoningKind,reasoningStrength,subscriptionLevels,configFor} from '../domain';
import type {State} from '../types';
import {api} from '../store';
import {IconButton} from './primitives';
import {ModelPicker} from './ModelPicker';
import {DropdownMenu,DropdownMenuContent,DropdownMenuLabel,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuTrigger} from './ui/dropdown-menu';

export type AgentAccess='view'|'project'|'full';
export type AgentAttachment={id:string;name:string;size:number;mime:string;kind:string;truncated?:boolean;dataUrl?:string};
export const agentReasoningLevels=(model:string)=>subscriptionLevels(model)??(model==='qwen-3.8-27b-it'?[['off','Без рассуждений'],['low','Лёгкие'],['medium','Средние'],['xhigh','Максимальные']]:reasoningKind(model)==='toggle'?[['on','Включены'],['off','Выключены']]:reasoningKind(model)?[['low','Лёгкие'],['medium','Средние'],['high','Глубокие'],['xhigh','Максимальные']]:[]);
export function defaultAgentReasoning(model:string,state:State){
 const config=configFor(model,state.settings,{}),levels=agentReasoningLevels(model);
 if(!levels.length)return null;
 const value=model==='qwen-3.8-27b-it'?(config.thinking===false?'off':config.reasoning_effort||'xhigh'):reasoningKind(model)==='toggle'?(config.thinking===false?'off':'on'):reasoningStrength(model,config);
 return levels.some(([id])=>id===value)?value:levels[levels.length-1][0];
}
const modes:[AgentAccess,string,string][]=[['view','Просмотр','Чтение файлов проекта без правок и запуска команд.'],['project','Работа в проекте','Файловые правки в проекте. Команды с правами Windows — только с вашего разрешения.'],['full','Полный доступ','Файлы и команды на компьютере без запросов разрешения. Откат охватывает папку проекта.']];
export function AgentControls({state,model,reasoning,access,disabled,onChange}:{state:State;model:string;reasoning:string|null;access:AgentAccess;disabled:boolean;onChange:(patch:{model?:string;reasoning?:string|null;access?:AgentAccess})=>Promise<void>}){
 const levels=agentReasoningLevels(model),AccessIcon=access==='full'?ShieldCheck:access==='view'?Eye:Shield;
 return <div className="agent-controls">
  <ModelPicker state={state} selection={{model,disabled,onSelect:id=>onChange({model:id,reasoning:defaultAgentReasoning(id,state)})}}/>
  {!!levels.length&&<DropdownMenu modal={false}><DropdownMenuTrigger asChild><button type="button" disabled={disabled} className="agent-option-trigger" aria-label="Уровень рассуждений"><Brain size={14}/><span>{levels.find(([id])=>id===reasoning)?.[1]||'Рассуждения'}</span><ChevronDown size={12}/></button></DropdownMenuTrigger><DropdownMenuContent className="floating-panel composer-reasoning-menu" side="top" align="end" collisionPadding={12}><DropdownMenuLabel>Уровень рассуждений</DropdownMenuLabel><DropdownMenuRadioGroup value={reasoning||''} onValueChange={value=>void onChange({reasoning:value})}>{levels.map(([id,label])=><DropdownMenuRadioItem key={id} value={id}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>}
  <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button type="button" disabled={disabled} className={`agent-option-trigger ${access==='full'?'agent-full-access':''}`} aria-label="Режим доступа"><AccessIcon size={14}/><span>{modes.find(([id])=>id===access)?.[1]}</span><ChevronDown size={12}/></button></DropdownMenuTrigger><DropdownMenuContent className="floating-panel agent-access-menu" side="top" align="end" collisionPadding={12}><DropdownMenuLabel>Режим доступа</DropdownMenuLabel><DropdownMenuRadioGroup value={access} onValueChange={value=>void onChange({access:value as AgentAccess})}>{modes.map(([id,label,note])=><DropdownMenuRadioItem key={id} value={id}><span><strong>{label}</strong><small>{note}</small></span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>
 </div>;
}

export function AgentAttachments({items,onRemove}:{items:AgentAttachment[];onRemove?:(id:string)=>void}){
 const [images,setImages]=useState<Record<string,string>>({});
 useEffect(()=>{let alive=true;for(const item of items){if(item.kind==='image'&&!item.dataUrl&&!images[item.id])void api('/api/agent/attachments/'+item.id).then(data=>{if(alive&&data.attachment.dataUrl)setImages(old=>({...old,[item.id]:data.attachment.dataUrl}))}).catch(()=>{})}return()=>{alive=false}},[items]);
 if(!items.length)return null;
 return <div className="agent-attachments">{items.map(item=><div className="agent-attachment" key={item.id}>{item.kind==='image'&&(item.dataUrl||images[item.id])?<img src={item.dataUrl||images[item.id]} alt={item.name}/>:<File size={18}/>}<span title={item.name}><strong>{item.name}</strong><small>{(item.size/1024).toFixed(0)} КБ{item.truncated?' · текст фрагментом':''}</small></span>{onRemove&&<IconButton label={`Убрать ${item.name}`} onClick={()=>onRemove(item.id)}><X size={14}/></IconButton>}</div>)}</div>;
}

export async function agentFilePayload(file:File){
 if(file.size>10*1024*1024)throw new Error('Файлы должны быть не больше 10 МБ');
 const data_url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));reader.readAsDataURL(file)});
 return {name:file.name,data_url};
}
