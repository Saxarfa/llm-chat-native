import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../store';
import {defaultImageLoras,type ImageLora} from '../imageLoras';
export type ImageDraft={prompt:string;negative:string;model:string;sampler:string;scheduler?:string;denoise?:number;size:string;width:number|string;height:number|string;steps:number;cfg:number;seed:string;loras:ImageLora[]};
const defaults:ImageDraft={prompt:'',negative:'',model:'anima_baseV10.safetensors',sampler:'er_sde',scheduler:'normal',denoise:1,size:'1024x1024',width:1024,height:1024,steps:30,cfg:4,seed:'-1',loras:defaultImageLoras('anima')};
function cached(key:string){try{return Object.fromEntries(Object.entries(JSON.parse(sessionStorage.getItem(key)||'{}')).filter(([name])=>!name.startsWith('edit_')))}catch{return {}}}
export function useImageDraft(userId:string){
 const key='image-draft-'+userId,outboxKey='image-draft-outbox-'+userId;
 const [values,setValues]=useSnapshotState<ImageDraft>(()=>({...defaults,...cached(key)})),[ready,setReady]=useState(false),[syncError,setSyncError]=useState(''),[switching,setSwitching]=useState(false);
 const modelSwitch=useRef(false);
 const pending=useRef<Partial<ImageDraft>>(cached(outboxKey)),inflight=useRef<Partial<ImageDraft>>({}),version=useRef(-1),enabled=useRef(false),alive=useRef(true),writing=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const legacy=useRef(cached(key));
 const source=window.storageManager.tabId;
 const saveOutbox=()=>{try{sessionStorage.setItem(outboxKey,JSON.stringify({...inflight.current,...pending.current}))}catch{}};
 const apply=useCallback((data:{values:ImageDraft;version:number})=>{if(!alive.current||data.version<version.current)return;version.current=data.version;setValues(old=>({...old,...data.values,...inflight.current,...pending.current}))},[]);
 const flush=useCallback(async()=>{
  if(!enabled.current||writing.current)return;
  writing.current=true;
  try{while(Object.keys(pending.current).length){const patch=pending.current;pending.current={};inflight.current=patch;saveOutbox();try{const body=JSON.stringify({values:patch,source_tab:source});const response=await fetch('/api/images/settings',{method:'PATCH',headers:window.storageManager.getAuthHeaders(),body,keepalive:new TextEncoder().encode(body).length<60000});const result=await response.json();if(!response.ok)throw Error(result.detail||'Настройки не сохранены');inflight.current={};saveOutbox();apply(result);if(alive.current)setSyncError('')}catch(e){pending.current={...patch,...pending.current};inflight.current={};saveOutbox();if(alive.current)setSyncError('Нет синхронизации. Повторяю подключение…');break}}}finally{writing.current=false;if(alive.current&&Object.keys(pending.current).length){clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),1500)}}
 },[apply,source,outboxKey]);
 const edit=useCallback((patch:Partial<ImageDraft>)=>{pending.current={...pending.current,...patch};saveOutbox();setValues(v=>({...v,...patch}));clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),150)},[flush,outboxKey]);
 const switchModel=useCallback(async(model:string)=>{
  if(!enabled.current||modelSwitch.current)return;
  modelSwitch.current=true;setSwitching(true);
  try{
   while(writing.current)await new Promise(resolve=>setTimeout(resolve,25));
   await flush();
   if(Object.keys(pending.current).length)throw Error('Сначала нужно сохранить текущие настройки');
   const data=await api('/api/images/settings','PATCH',{values:{model},source_tab:source});
   apply(data);if(alive.current)setSyncError('');
  }catch(e){if(alive.current)setSyncError(e instanceof Error?e.message:String(e))}
  finally{modelSwitch.current=false;if(alive.current)setSwitching(false)}
 },[flush,source,apply]);
 useEffect(()=>{alive.current=true;const receive=(event:Event)=>{const data=(event as CustomEvent).detail;if(String(data.user_id)===userId)apply(data)};window.addEventListener('image-settings-updated',receive);const refresh=async()=>{try{apply(await api('/api/images/settings'))}catch{}};
  void(async()=>{try{let data=await api('/api/images/settings');if(data.version===0&&Object.keys(legacy.current).length)data=await api('/api/images/settings','PATCH',{values:legacy.current,initialize:true,source_tab:source});apply(data);enabled.current=true;if(alive.current)setReady(true);void flush()}catch{if(alive.current){setSyncError('Не удалось загрузить общие настройки. Повторяю подключение…');timer.current=setTimeout(()=>void initializeAgain(),1500)}}})();
  const initializeAgain=async()=>{try{let data=await api('/api/images/settings');if(data.version===0&&Object.keys(legacy.current).length)data=await api('/api/images/settings','PATCH',{values:legacy.current,initialize:true,source_tab:source});apply(data);enabled.current=true;if(alive.current){setReady(true);setSyncError('')}void flush()}catch{if(alive.current)timer.current=setTimeout(()=>void initializeAgain(),1500)}};
  const stopPolling=pollVisible(async()=>{if(enabled.current)await refresh()},2000);
  const hide=()=>{void flush()};window.addEventListener('pagehide',hide);
  return()=>{window.removeEventListener('image-settings-updated',receive);window.removeEventListener('pagehide',hide);stopPolling();clearTimeout(timer.current);void flush();alive.current=false};
 },[userId,apply,flush,key,source]);
 useEffect(()=>{if(ready)try{sessionStorage.setItem(key,JSON.stringify(values))}catch{}},[key,values,ready]);
 const importSettings=useCallback(async(values:Partial<ImageDraft>)=>{
  if(!enabled.current||modelSwitch.current)throw Error('Дождись загрузки настроек');
  modelSwitch.current=true;setSwitching(true);
  try{
   while(writing.current)await new Promise(resolve=>setTimeout(resolve,25));
   await flush();
   if(Object.keys(pending.current).length)throw Error('Не удалось сохранить текущие настройки. Проверь соединение.');
   const result=await api('/api/images/settings','PATCH',{values,source_tab:source});apply(result);
   if(alive.current)setSyncError('');
  }finally{modelSwitch.current=false;if(alive.current)setSwitching(false)}
 },[apply,flush,source]);
 return {values,edit,ready:ready&&!switching,syncError,flush,switchModel,importSettings};
}
