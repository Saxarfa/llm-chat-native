import {useRef,useState} from 'react';
import {Upload,X,Loader2} from '../icons';
import {IconButton} from './primitives';
import type {ImageDraft} from './useImageDraft';
import './ImageSettingsImport.css';

export function useImageSettingsImport(apply:(values:Partial<ImageDraft>)=>Promise<void>,disabled:boolean){
 const input=useRef<HTMLInputElement>(null),working=useRef(false),depth=useRef(0);
 const [dragging,setDragging]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<{error?:string;warnings?:string[];name?:string}|null>(null);
 const load=async(file:File)=>{
  if(disabled||working.current)return;
  setResult(null);
  if(file.size>40*1024**2){setResult({error:'Файл должен быть не больше 40 МБ.'});return}
  working.current=true;setBusy(true);
  try{
   const response=await fetch('/api/images/import-settings',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':file.type||'application/octet-stream'},body:file});
   const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Не удалось прочитать настройки арта');
   await apply(data.values);setResult({name:file.name,warnings:data.warnings||[]});
  }catch(e){setResult({error:e instanceof Error?e.message:'Не удалось импортировать настройки'})}
  finally{working.current=false;setBusy(false)}
 };
 const handlers={
  onDragEnter:(event:React.DragEvent)=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();depth.current++;if(!disabled)setDragging(true)},
  onDragOver:(event:React.DragEvent)=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=disabled?'none':'copy'}},
  onDragLeave:(event:React.DragEvent)=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();if(--depth.current<=0){depth.current=0;setDragging(false)}},
  onDrop:(event:React.DragEvent)=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();event.stopPropagation();depth.current=0;setDragging(false);const file=event.dataTransfer.files[0];if(file)void load(file)},
 };
 const control=<><input ref={input} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void load(file)}}/><IconButton label="Импортировать настройки из арта" disabled={disabled||busy} onClick={()=>input.current?.click()}>{busy?<Loader2 size={18} className="spin"/>:<Upload size={18}/>}</IconButton></>;
 const notice=<>{dragging&&<div className="studio-import-drop"><Upload size={28}/><strong>Восстановить настройки арта</strong><span>Отпусти оригинальный файл из ComfyUI</span></div>}{result&&<div className="studio-import-notice" role={result.error?'alert':'status'}><div><strong>{result.error||'Настройки импортированы'}</strong>{result.name&&<small>{result.name}</small>}{result.warnings?.map((warning,index)=><p key={index}>{warning}</p>)}</div><IconButton label="Закрыть сообщение об импорте" onClick={()=>setResult(null)}><X size={16}/></IconButton></div>}</>;
 return {handlers,control,notice,busy};
}
