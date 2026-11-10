import {useEffect,useState} from 'react';
import {PanelLeft,RefreshCw,ArrowLeft,History} from '../icons';
import {api} from '../store';
import type {State} from '../types';
import {Button,IconButton} from './primitives';
import {ActivityIndicator} from './ActivityIndicator';
import AgentWorkspace from './AgentWorkspace';
import './NativeAgent.css';

export default function NativeAgent(props:{state:State;onMenu:()=>void;showMenu:boolean;userId:string}){
 const [legacy,setLegacy]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(legacy)return;let alive=true;setError('');setUrl('');
  void api('/api/harness-web/start','POST',{},180000).then(data=>{if(alive)setUrl(data.url)}).catch(e=>{if(alive)setError((e as Error).message)});
  return()=>{alive=false};
 },[props.userId,legacy,attempt]);
 if(legacy)return <div className="native-agent-legacy"><div className="native-agent-switch"><Button variant="ghost" onClick={()=>setLegacy(false)}><ArrowLeft size={14}/>Штатный Harness</Button></div><AgentWorkspace {...props}/></div>;
 return <section className="native-agent-shell">
  <header className="native-agent-header"><div>{props.showMenu&&<IconButton label="Открыть меню" onClick={props.onMenu}><PanelLeft size={18}/></IconButton>}<span>Агент</span><small>DeepSeek Harness</small></div><div><IconButton label="Перезагрузить интерфейс агента" onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/></IconButton><Button variant="ghost" onClick={()=>setLegacy(true)}><History size={16}/>Предыдущий агент</Button></div></header>
  {url?<iframe key={url+attempt} className="native-agent-frame" src={url} title="DeepSeek Harness — агент LLM Chat" allow="clipboard-read; clipboard-write"/>:<div className="native-agent-loading">{error?<><p role="alert">{error}</p><div><Button onClick={()=>setAttempt(n=>n+1)}>Повторить запуск</Button><Button variant="ghost" onClick={()=>setLegacy(true)}>Предыдущий агент</Button></div></>:<><ActivityIndicator kind="processing" state="running" label="Запускаю DeepSeek Harness"/><p>Первый запуск может занять пару минут.</p></>}</div>}
 </section>;
}
