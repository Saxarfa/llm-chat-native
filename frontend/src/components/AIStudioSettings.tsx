import {SettingsError,SettingsLoading} from './SettingsFeedback';
import {useEffect,useRef,useState} from 'react';
import {Loader2} from '../icons';
import {api,refreshModels} from '../store';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {Button} from './primitives';

type Status={installed:boolean;configured:boolean;connecting:boolean;phase?:string;error?:string;models:{id:string;name:string}[]};
export function AIStudioSettings(){
 const [status,setStatus]=useSnapshotState<Status|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const catalog=useRef('');
 useEffect(()=>{let live=true;const stop=pollVisible(async()=>{try{const next:Status=await api('/api/providers/aistudio');if(!live)return;setStatus(next);const signature=JSON.stringify(next.models);if(signature!==catalog.current){catalog.current=signature;void refreshModels()}}catch{if(live)setError('Не удалось прочитать состояние AI Studio')}},2500);return()=>{live=false;stop()}},[]);
 const run=async(action:'connect'|'check'|'disconnect')=>{
  setBusy(true);setError('');setMessage('');
  try{const next:Status=await api('/api/providers/aistudio'+(action==='disconnect'?'':'/'+action),action==='disconnect'?'DELETE':'POST');setStatus(next);setMessage(action==='connect'?'Войдите в Google в отдельном окне на компьютере, где запущено приложение.':action==='check'?'Подключение проверено. Доступные модели добавлены в список моделей.':'AI Studio отключена. История чатов сохранена.');await refreshModels()}
  catch(e){setError(e instanceof Error?e.message:'Не удалось подключить AI Studio')}finally{setBusy(false)}
 };
 const phase=status?.phase==='preparing'?'Подготавливаем подключение…':status?.phase==='checking'?'Проверяем доступные модели…':'Ожидаем вход в Google…';
 return <div className="explanation-card"><strong>Google AI Studio</strong>
  <p>{status?.connecting?phase:status?.configured?`${status.models.map(m=>m.name).join(' · ')} доступны в чате.`:'Gemma 4, Gemini Flash и Gemini 4 Argon через ваш аккаунт Google AI Studio.'}</p>
  <p>Облачные модели с историей чатов, изображениями, инструментами и рассуждениями. API-ключ не нужен. Подключение работает на компьютере вместе с приложением.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <Button variant="outline" disabled={busy||!status||status.connecting} onClick={()=>void run('connect')}>{status?.connecting&&<Loader2 size={14} className="spin"/>}{status?.configured?'Войти снова':'Войти в Google'}</Button>
   {status?.configured&&<Button variant="outline" disabled={busy||status.connecting} onClick={()=>void run('check')}>{busy?'Проверяем…':'Проверить подключение'}</Button>}
   {(status?.configured||status?.connecting)&&<Button variant="outline" disabled={busy} onClick={()=>void run('disconnect')}>{status?.connecting?'Отменить вход':'Отключить'}</Button>}
  </div>
  {!status&&!error&&<SettingsLoading label="Проверяем подключение…"/>}{message&&<p role="status">{message}</p>}{(error||status?.error)&&<SettingsError retry={()=>void run('check')}/>}
 </div>;
}
