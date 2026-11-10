import {LoraLibrary} from './LoraLibrary';
import {useEffect,useState} from 'react';
import {Check,Loader2,Plus,RefreshCw,Search,X} from '../icons';
import {api} from '../store';
import {type ImageLora,type LoraEntry,loraDisplayName} from '../imageLoras';
import {imageModelEngine} from './imageModels';
import {Disclosure,IconButton} from './primitives';
import './LoraControls.css';

const displayName=loraDisplayName;
export function LoraControls({model,value,onChange,onAddTriggers}:{model:string;value:ImageLora[];onChange:(value:ImageLora[])=>void;onAddTriggers?:(text:string)=>void}){
 const [catalog,setCatalog]=useState<LoraEntry[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const engine=imageModelEngine(model);
 useEffect(()=>{
  let alive=true,ticket=0;
  const load=async()=>{const current=++ticket;setBusy(true);try{const data=await api('/api/images/loras');if(alive&&current===ticket){setCatalog(data.loras);setError('')}}catch{if(alive&&current===ticket)setError('Не удалось загрузить LoRA из ComfyUI')}finally{if(alive&&current===ticket)setBusy(false)}};
  const recovered=()=>void load();void load();window.addEventListener('image-server-online',recovered);
  return()=>{alive=false;window.removeEventListener('image-server-online',recovered)};
 },[]);
 const refresh=async()=>{setBusy(true);setError('');try{const data=await api('/api/images/loras');setCatalog(data.loras)}catch{setError('Не удалось загрузить LoRA из ComfyUI')}finally{setBusy(false)}};
 const filtered=catalog.filter(item=>`${displayName(item.name)} ${item.name}`.toLowerCase().includes(query.toLowerCase()));
 const changeStrength=(name:string,field:'strength'|'strength_clip',strength:number)=>onChange(value.map(item=>item.name===name?{...item,strength_clip:item.strength_clip??item.strength,[field]:strength}:item));
 return <Disclosure title={`LoRA${value.length?` · ${value.length}`:''}`} className="lora-disclosure"><div className="lora-controls"><LoraLibrary catalog={catalog} architecture={engine} value={value} onChange={onChange} onAddTriggers={onAddTriggers}/>
  {value.length>0&&<div className="lora-selected">{value.map(item=><div className="lora-selected-item" key={item.name}><header><span title={item.name}>{displayName(item.name)}</span><IconButton label={`Убрать LoRA ${displayName(item.name)}`} onClick={()=>onChange(value.filter(selected=>selected.name!==item.name))}><X size={14}/></IconButton></header>{([['strength','Модель'],['strength_clip','CLIP']] as const).map(([field,label])=><label key={field} title={field==='strength'?'strength_model':'strength_clip'}><span>{label}</span><input aria-label={`${label} LoRA ${displayName(item.name)}`} type="range" min={0} max={2} step={.05} value={field==='strength'?item.strength:(item.strength_clip??item.strength)} onChange={event=>changeStrength(item.name,field,Number(event.target.value))}/><output>{(field==='strength'?item.strength:(item.strength_clip??item.strength)).toFixed(2)}</output></label>)}</div>)}</div>}
  <div className="lora-search-row"><label className="lora-search-label">Поиск LoRA<span className="lora-search"><Search size={14}/><input aria-label="Найти LoRA" placeholder="Название LoRA" value={query} onChange={event=>setQuery(event.target.value)}/></span></label><IconButton label="Обновить список LoRA" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={14} className={busy?'spin':''}/></IconButton></div>
  <div className="lora-catalog-heading"><span>{busy?<><Loader2 size={12} className="spin"/>Загружаю…</>:`Всего · ${catalog.length}`}</span></div>
  <div className="lora-catalog">{filtered.map(item=>{const selected=value.some(entry=>entry.name===item.name);return <button type="button" className={selected?'is-selected':''} key={item.name} title={item.name} disabled={!selected&&value.length>=8} aria-pressed={selected} aria-label={`${selected?'Убрать':'Добавить'} LoRA ${displayName(item.name)}`} onClick={()=>onChange(selected?value.filter(entry=>entry.name!==item.name):[...value,{name:item.name,strength:1,strength_clip:1}])}><span>{displayName(item.name)}</span>{selected?<Check size={14}/>:<Plus size={14}/>}</button>})}</div>
  {!busy&&!error&&!filtered.length&&<p className="lora-empty">{query?'LoRA не найдена':'В ComfyUI нет LoRA'}</p>}
  {error&&<p role="status" className="lora-error">{error}</p>}
 </div></Disclosure>;
}
