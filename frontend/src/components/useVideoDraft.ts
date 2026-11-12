import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../store';
import {accountKey} from '../accountStorage';
export type VideoDraft={engine:'h3'|'dasiwa';prompt:string;sourceId:string;duration:number;resolution:string;steps:number;seed:string;anime:boolean;audio:boolean;translate:boolean};
const defaults:VideoDraft={engine:'h3',prompt:'',sourceId:'',duration:5,resolution:'preview',steps:4,seed:'-1',anime:true,audio:false,translate:true};
function cached(key:string){try{return Object.fromEntries(Object.entries(JSON.parse(sessionStorage.getItem(key)||'{}')).filter(([name])=>!name.startsWith('edit_')))}catch{return {}}}
export function useVideoDraft(userId:string){
 const key='video-draft-'+userId,outboxKey='video-draft-outbox-'+userId;
 const [values,setValues]=useSnapshotState<VideoDraft>(()=>({...defaults,...cached(key)})),[ready,setReady]=useState(false),[syncError,setSyncError]=useState(''),[loadFailureRevision,setLoadFailureRevision]=useState(0),[switching]=useState(false);
 const pending=useRef<Partial<VideoDraft>>(cached(outboxKey)),inflight=useRef<Partial<VideoDraft>>({}),version=useRef(-1),enabled=useRef(false),alive=useRef(true),writing=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 const legacy=useRef<Partial<VideoDraft>>((()=>{try{const data=JSON.parse(localStorage.getItem(accountKey('art-video-draft'))||'{}');return Object.fromEntries(Object.entries(data).filter(([k])=>k in defaults))}catch{return {}}})());
 const source=window.storageManager.tabId;
 const saveOutbox=()=>{try{sessionStorage.setItem(outboxKey,JSON.stringify({...inflight.current,...pending.current}))}catch{}};
 const apply=useCallback((data:{values:VideoDraft;version:number})=>{if(!alive.current||data.version<version.current)return;version.current=data.version;setValues(old=>({...old,...data.values,...inflight.current,...pending.current}))},[]);
 const flush=useCallback(async()=>{
  if(!enabled.current||writing.current)return;
  writing.current=true;
  try{while(Object.keys(pending.current).length){const patch=pending.current;pending.current={};inflight.current=patch;saveOutbox();try{const body=JSON.stringify({values:patch,source_tab:source});const response=await fetch('/api/videos/settings',{method:'PATCH',headers:window.storageManager.getAuthHeaders(),body,keepalive:new TextEncoder().encode(body).length<60000});const result=await response.json();if(!response.ok)throw Error(result.detail||'Настройки не сохранены');inflight.current={};saveOutbox();apply(result);if(alive.current)setSyncError('')}catch(e){pending.current={...patch,...pending.current};inflight.current={};saveOutbox();if(alive.current)setSyncError('Нет синхронизации. Повторяю подключение…');break}}}finally{writing.current=false;if(alive.current&&Object.keys(pending.current).length){clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),1500)}}
 },[apply,source,outboxKey]);
 const edit=useCallback((patch:Partial<VideoDraft>)=>{pending.current={...pending.current,...patch};saveOutbox();setValues(v=>({...v,...patch}));clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),150)},[flush,outboxKey]);
 useEffect(()=>{alive.current=true;const receive=(event:Event)=>{const data=(event as CustomEvent).detail;if(String(data.user_id)===userId)apply(data)};window.addEventListener('video-settings-updated',receive);const refresh=async()=>{try{apply(await api('/api/videos/settings'))}catch{}};
  void(async()=>{try{let data=await api('/api/videos/settings');if(data.version===0&&Object.keys(legacy.current).length)data=await api('/api/videos/settings','PATCH',{values:legacy.current,initialize:true,source_tab:source});apply(data);enabled.current=true;if(alive.current)setReady(true);void flush()}catch{if(alive.current){setLoadFailureRevision(value=>value+1);setSyncError('Не удалось загрузить общие настройки. Повторяю подключение…');timer.current=setTimeout(()=>void initializeAgain(),1500)}}})();
  const initializeAgain=async()=>{try{let data=await api('/api/videos/settings');if(data.version===0&&Object.keys(legacy.current).length)data=await api('/api/videos/settings','PATCH',{values:legacy.current,initialize:true,source_tab:source});apply(data);enabled.current=true;if(alive.current){setReady(true);setSyncError('')}void flush()}catch{if(alive.current){setLoadFailureRevision(value=>value+1);timer.current=setTimeout(()=>void initializeAgain(),1500)}}};
  const stopPolling=pollVisible(async()=>{if(enabled.current)await refresh()},2000);
  const hide=()=>{void flush()};window.addEventListener('pagehide',hide);
  return()=>{window.removeEventListener('video-settings-updated',receive);window.removeEventListener('pagehide',hide);stopPolling();clearTimeout(timer.current);void flush();alive.current=false};
 },[userId,apply,flush,key,source]);
 useEffect(()=>{if(ready)try{sessionStorage.setItem(key,JSON.stringify(values))}catch{}},[key,values,ready]);
 return {values,edit,ready:ready&&!switching,syncError,loadFailureRevision,flush};
}
