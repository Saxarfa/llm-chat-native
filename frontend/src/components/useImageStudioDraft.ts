import {useCallback,useEffect,useRef,useState} from 'react';
import {pollVisible} from '../visiblePolling';
import {api} from '../store';
import {useSnapshotState} from '../useSnapshotState';

export type ImageStudioDraft={source:'local'|'aistudio';prompt:string;model:string;aspect_ratio:string;image_size:string};
type StudioSettings={user_id?:string|number;version:number;values:ImageStudioDraft};
export const nanoBananaModel='aistudio/gemini-nano-banana-2.1';
const defaults:ImageStudioDraft={source:'local',prompt:'',model:nanoBananaModel,aspect_ratio:'auto',image_size:'1K'};
export const isAIStudioImage=(model?:string)=>!!model?.startsWith('aistudio/');
export function imageStudioRequestId(){
 if(typeof globalThis.crypto?.randomUUID==='function')return crypto.randomUUID();
 const bytes=new Uint8Array(16);
 if(typeof globalThis.crypto?.getRandomValues==='function')crypto.getRandomValues(bytes);
 else for(let index=0;index<bytes.length;index++)bytes[index]=Math.floor(Math.random()*256);
 return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}

/** Independent from the local image draft used by chat tools and actors. */
export function useImageStudioDraft(userId:string){
 const [values,setValues]=useSnapshotState<ImageStudioDraft>(defaults),[ready,setReady]=useState(false),[syncError,setSyncError]=useState('');
 const pending=useRef<Partial<ImageStudioDraft>>({}),inflight=useRef<Partial<ImageStudioDraft>>({}),version=useRef(-1),epoch=useRef(0),alive=useRef(true),enabled=useRef(false),writing=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const outboxKey=`image-studio-outbox-${userId}`,source=window.storageManager.tabId;
 const cache=useCallback(()=>{try{sessionStorage.setItem(outboxKey,JSON.stringify({...inflight.current,...pending.current}))}catch{}},[outboxKey]);
 const apply=useCallback((data:StudioSettings)=>{if(!alive.current||data.version<version.current)return;version.current=data.version;setValues(previous=>({...previous,...data.values,...inflight.current,...pending.current}))},[]);
 const flush=useCallback(async()=>{
  if(!enabled.current)return false;
  const ticket=epoch.current;
  while(writing.current)await new Promise(resolve=>setTimeout(resolve,20));
  if(ticket!==epoch.current)return false;
  writing.current=true;
  try{
   while(Object.keys(pending.current).length){
    const patch=pending.current;pending.current={};inflight.current=patch;cache();
    try{const result:StudioSettings=await api('/api/images/studio-settings','PATCH',{values:patch,source_tab:source});if(ticket!==epoch.current)return false;inflight.current={};cache();apply(result);if(alive.current)setSyncError('')}
    catch{if(ticket!==epoch.current)return false;pending.current={...patch,...pending.current};inflight.current={};cache();if(alive.current)setSyncError('Не удалось сохранить настройки AI Studio. Повторяю подключение…');return false}
   }
   return true;
  }finally{writing.current=false;if(ticket===epoch.current&&alive.current&&Object.keys(pending.current).length){clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),1500)}}
 },[apply,cache,source]);
 const edit=useCallback((patch:Partial<ImageStudioDraft>)=>{pending.current={...pending.current,...patch};cache();setValues(previous=>({...previous,...patch}));clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),200)},[cache,flush]);
 useEffect(()=>{
  const ticket=++epoch.current;alive.current=true;enabled.current=false;version.current=-1;inflight.current={};setReady(false);setValues(defaults);setSyncError('');
  try{pending.current=JSON.parse(sessionStorage.getItem(outboxKey)||'{}')}catch{pending.current={}}
  const receive=(event:Event)=>{const data=(event as CustomEvent<StudioSettings>).detail;if(String(data.user_id)===userId)apply(data)};
  const refresh=async()=>{try{const result:StudioSettings=await api('/api/images/studio-settings');if(ticket!==epoch.current||!alive.current)return;apply(result);enabled.current=true;setReady(true);setSyncError('');if(Object.keys(pending.current).length)void flush()}catch{if(ticket===epoch.current&&alive.current)setSyncError('Не удалось загрузить настройки студии. Повторяю подключение…')}};
  const stop=pollVisible(refresh,2000),hide=()=>{void flush()};
  const restored=()=>{version.current=-1;void refresh()};
  window.addEventListener('image-studio-settings-updated',receive);window.addEventListener('project-data-restored',restored);window.addEventListener('pagehide',hide);
  return()=>{stop();window.removeEventListener('image-studio-settings-updated',receive);window.removeEventListener('project-data-restored',restored);window.removeEventListener('pagehide',hide);clearTimeout(timer.current);cache();++epoch.current;enabled.current=false;alive.current=false};
 },[userId,outboxKey,apply,flush,cache]);
 return {values,edit,ready,syncError,flush};
}
