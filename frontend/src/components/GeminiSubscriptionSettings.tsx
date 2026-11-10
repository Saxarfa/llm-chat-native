import {SettingsError,SettingsLoading} from './SettingsFeedback';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {useEffect,useRef,useState} from 'react';
import {api,refreshModels} from '../store';
import {Button} from './primitives';

type Status={installed:boolean;installing?:boolean;configured:boolean;connecting:boolean;error?:string};
export function GeminiSubscriptionSettings(){
 const [status,setStatus]=useSnapshotState<Status|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const connected=useRef(false);
 useEffect(()=>{let live=true;const load=async()=>{try{const next:Status=await api('/api/providers/google-subscription');if(!live)return;setStatus(next);if(next.configured&&!connected.current)void refreshModels();connected.current=next.configured}catch{if(live)setError('Не удалось прочитать состояние Antigravity CLI')}};const stopPolling=pollVisible(load,3000);return()=>{live=false;stopPolling()}},[]);
 const run=async(action:'connect'|'check'|'disconnect')=>{
  setBusy(true);setError('');setMessage('');
  try{const next:Status=await api('/api/providers/google-subscription'+(action==='disconnect'?'':'/'+action),action==='disconnect'?'DELETE':'POST');setStatus(next);setMessage(action==='connect'?'Проверяем Google. Если откроется вход, выберите аккаунт с подпиской.':action==='check'?'Gemini ответил. Подключение работает.':'Подписка отключена в этом приложении.');await refreshModels()}
  catch(e){setError(e instanceof Error?e.message:'Не удалось подключить Antigravity CLI')}finally{setBusy(false)}
 };
 return <div className="explanation-card"><strong>Gemini · через подписку</strong>
  <p>{status?.installing?'Подготавливаем подключение Google…':status?.connecting?'Ожидаем вход в Google…':status?.configured?'Google подключён. Выберите модель с отметкой «Подписка» в чате.':'Войдите аккаунтом с Google AI Pro или Ultra. Используется официальный Antigravity CLI и его лимиты.'}</p>
  <p>Текстовые диалоги, перевод, анализ изображений, интернет-поиск и генерация артов через ComfyUI. Поиск включается в инструментах чата. Запросы отправляются Google; перехода на платный API при исчерпании лимита нет.</p>
  {status&&!status.installed&&!status.connecting&&<p>Необходимый компонент установится автоматически при подключении.</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <Button variant="outline" disabled={busy||!status||status.connecting} onClick={()=>void run('connect')}>{status?.configured?'Обновить подключение':'Подключить Google'}</Button>
   {status?.configured&&<Button variant="outline" disabled={busy||status?.connecting} onClick={()=>void run('check')}>{busy?'Проверяем…':'Проверить подключение'}</Button>}
   {(status?.configured||status?.connecting)&&<Button variant="outline" disabled={busy} onClick={()=>void run('disconnect')}>{status?.connecting?'Отменить вход':'Отключить'}</Button>}
  </div>
  {!status&&!error&&<SettingsLoading label="Проверяем подключение…"/>}{message&&<p role="status">{message}</p>}{(error||status?.error)&&<SettingsError retry={()=>void run('check')}/>}
 </div>;
}
