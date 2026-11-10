import {useState} from 'react';
import {nativeServer,saveNativeServer} from './network';
import '../components/SignIn.css';

export function NativeConnection({onClose}:{onClose?:()=>void}){
 const[value,setValue]=useState(nativeServer()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <main className="auth-screen account-auth"><section className="auth-card native-connection" aria-labelledby="native-connection-title">
  <header><img src="/css/icons/llm-chat.svg" width="48" height="48" alt=""/><h2 id="native-connection-title">Подключите ваш ПК</h2><p>Чаты, модели и генерация работают на компьютере. Оставьте LLM Chat включённым и подключите iPhone к той же сети или к вашему VPN.</p></header>
  <form aria-busy={busy} onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');void saveNativeServer(value).catch(()=>{setError('Не удалось подключиться. Проверьте адрес, Wi-Fi и запуск LLM Chat на ПК.');setBusy(false)})}}>
   <label htmlFor="native-server">Адрес LLM Chat на ПК<input id="native-server" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={value} placeholder="http://192.168.1.10:8000" onChange={event=>{setValue(event.target.value);setError('')}}/></label>
   {error&&<p className="auth-error" role="alert">{error}</p>}
   <button className="auth-submit" type="submit" disabled={busy}>{busy?'Проверяем подключение…':'Подключить'}</button>
   {onClose&&<button type="button" onClick={onClose} disabled={busy}>Вернуться в приложение</button>}
  </form>
 </section></main>;
}
