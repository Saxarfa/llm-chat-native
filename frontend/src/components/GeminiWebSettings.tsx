import {SettingsError,SettingsLoading} from './SettingsFeedback';
import {useEffect,useRef,useState} from 'react';
import {api,refreshModels} from '../store';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {Button} from './primitives';
import {ActivityIndicator} from './ActivityIndicator';

type Status={configured:boolean;connecting:boolean;phase?:string;error?:string;models:{id:string;name:string}[]};
export function GeminiWebSettings(){
 const [status,setStatus]=useSnapshotState<Status|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const catalog=useRef('');
 useEffect(()=>{let live=true;const stop=pollVisible(async()=>{try{const next:Status=await api('/api/providers/gemini-web');if(!live)return;setStatus(next);const signature=JSON.stringify(next.models);if(signature!==catalog.current){catalog.current=signature;void refreshModels()}}catch{if(live)setError('Не удалось проверить Gemini Web')}},2500);return()=>{live=false;stop()}},[]);
 const run=async(action:'connect'|'check'|'disconnect')=>{
  setBusy(true);setError('');setMessage('');
  try{const next:Status=await api('/api/providers/gemini-web'+(action==='disconnect'?'':'/'+action),action==='disconnect'?'DELETE':'POST');setStatus(next);if(action==='check')setMessage('Подключение проверено. Список моделей обновлён.');if(action==='disconnect')setMessage('Gemini Web отключён. Чаты сохранены.');await refreshModels()}
  catch(e){setError(e instanceof Error?e.message:'Не удалось подключить Gemini Web')}finally{setBusy(false)}
 };
 const phase=status?.phase==='preparing'?'Подготавливаем подключение…':status?.phase==='checking'?'Проверяем модели аккаунта…':'Войдите в Google в открывшемся окне на компьютере с приложением.';
 return <div className="explanation-card"><strong>Gemini · веб-чат</strong>
  {status?.connecting?<p role="status"><ActivityIndicator kind="processing" label={phase}/></p>:<p>{status?.configured?status.models.map(m=>m.name).join(' · '):'Argon, Flash и другие модели, доступные в вашем аккаунте Gemini.'}</p>}
  <p>Без API-ключа. Модели появятся во вкладке «Подписка» с отметкой Gemini Web. История, картинки и инструменты доступны в обычном чате. Antigravity подключается отдельно.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <Button variant="outline" disabled={busy||!status||status.connecting} onClick={()=>void run('connect')}>{status?.configured?'Подключить заново':'Подключить Google'}</Button>
   {status?.configured&&<Button variant="outline" disabled={busy||status.connecting} onClick={()=>void run('check')}>{busy?'Проверяем…':'Проверить подключение'}</Button>}
   {(status?.configured||status?.connecting)&&<Button variant="outline" disabled={busy} onClick={()=>void run('disconnect')}>{status?.connecting?'Отменить':'Отключить'}</Button>}
  </div>
  {!status&&!error&&<SettingsLoading label="Проверяем подключение…"/>}{message&&<p role="status">{message}</p>}{(error||status?.error)&&<SettingsError retry={()=>void run('check')}/>}
 </div>;
}
