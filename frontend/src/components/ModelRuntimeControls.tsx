import {useSettingsScope} from './SettingsScope';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {Select,SelectOption} from './Select';
import {useEffect,useId,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Download,Power,Loader2,Check} from '../icons';
import {api,inferencePayload,useChatLayout} from '../store';
import {Button} from './primitives';
import './ModelRuntimeControls.css';

type RuntimeModel={id:string;state:string;configured_context?:number;runtime_context?:number;native_context?:number;max_context?:number;can_context:boolean};
type Operation={id:string;model:string;action:string;state:string;error?:string;context?:number};
type Runtime={available:boolean;models:RuntimeModel[];operation?:Operation;managed_endpoint:string;site_endpoints?:string[]};
const presets=[8192,16384,32768,65536,131072];
const active=(op?:Operation)=>!!op&&!['completed','failed'].includes(op.state);
const label=(state?:string)=>state==='loaded'||state==='ready'?'Готова':state==='loading'||state==='starting'?'Загружается':state==='unloaded'||state==='stopped'?'Выгружена':'Нет данных';
const endpoint=(value:string)=>value.replace(/\/$/,'').replace(/\/v1$/,'').replace('://localhost:', '://127.0.0.1:');

export function ModelRuntimeControls({model,selectMenuClassName}:{model:string;selectMenuClassName?:string}){
 const settingsScope=useSettingsScope();
 const controlId=useId();
 const state=useChatLayout(),reduced=useReducedMotion(),[data,setData]=useSnapshotState<Runtime|undefined>(undefined),[checked,setChecked]=useState(false),[context,setContext]=useState(''),[custom,setCustom]=useState(false),[error,setError]=useState(''),[sending,setSending]=useState(false),revision=useRef(0);
 const info=data?.models.find(m=>m.id===model),operation=data?.operation,busy=sending||active(operation),ownOperation=operation?.model===model;
 const requestEndpoint=inferencePayload().settings.endpoint||'';
 const supported=!requestEndpoint||endpoint(requestEndpoint)===endpoint(data?.managed_endpoint||'')||!!data?.site_endpoints?.some(base=>endpoint(base)===endpoint(requestEndpoint));
 useEffect(()=>{
  let cancelled=false;
  const refresh=async()=>{const ticket=++revision.current;try{const next=await api('/api/models/runtime');if(!cancelled&&ticket===revision.current)setData(next)}catch{if(!cancelled&&ticket===revision.current)setData(undefined)}finally{if(!cancelled&&ticket===revision.current)setChecked(true)}};
  const updated=()=>void refresh();const stopPolling=pollVisible(refresh,4000);
  window.addEventListener('model-runtime-updated',updated);
  return()=>{cancelled=true;stopPolling();window.removeEventListener('model-runtime-updated',updated)};
 },[model]);
 useEffect(()=>{const n=info?.configured_context;setContext(n?String(n):'');setCustom(!!n&&!presets.includes(n))},[model,info?.configured_context]);
 const run=async(action:'load'|'unload'|'context')=>{
  if(busy||!supported)return;setSending(true);setError('');
  try{const result=await api('/api/models/runtime/'+encodeURIComponent(model),'POST',{action,...(action==='context'?{context:Number(context),expected_context:info?.configured_context}:{})});setData(old=>old?{...old,operation:result.operation}:old);window.dispatchEvent(new Event('model-runtime-updated'))}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSending(false)};
 };
 const ready=info?.state==='loaded'||info?.state==='ready',unloaded=info?.state==='unloaded'||info?.state==='stopped';
 const valid=Number.isInteger(Number(context))&&Number(context)>=512&&Number(context)<=(info?.max_context||0);
 const statusText=busy&&ownOperation?operation?.state==='waiting'?'В очереди':operation?.state==='unloading'?'Выгружается':operation?.state==='applying'?'Применяется контекст':'Загружается':label(info?.state);
 const displayedError=error||(ownOperation&&operation?.state==='failed'?operation.error:'');
 if(model.startsWith('gemini-web/'))return <p className="settings-intro">Gemini Web · ваш аккаунт Google. История хранится в приложении и передаётся отдельно для каждого запроса. Бюджет контекста приложения — 65 536 токенов. Температурой и длиной ответа управляет Google.</p>;
 if(model.startsWith('aistudio/'))return <p className="settings-intro">Google AI Studio · облако. Модель работает на серверах Google. История сохраняется в приложении; видеопамять компьютера остаётся свободной.</p>;
 if(model.startsWith('google-subscription/'))return <p className="settings-intro">Antigravity CLI · подписка. Модель работает в облаке. Параметрами генерации управляет Antigravity CLI; локальные настройки слоёв и сэмплинга к ней не применяются.</p>;
 return <section className="model-runtime" aria-label="Модель и контекст" aria-busy={busy}>
  <header><strong>Модель и контекст</strong><span className="model-runtime-status" data-state={ready?'ready':busy?'busy':'idle'}>{busy&&ownOperation?<Loader2 size={12} className="spin"/>:<i/>}<AnimatePresence mode="wait" initial={false}><motion.span key={statusText} initial={{opacity:0,y:2}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-2}} transition={{duration:reduced?0:.14}}>{statusText}</motion.span></AnimatePresence></span></header>
  {!data?<p className="model-runtime-note">{checked?'Соединение с сервером моделей не установлено.':'Проверяю подключение к серверу моделей…'}</p>:!supported?<p className="model-runtime-note">Управление доступно для локального сервера моделей. В подключении выбран другой сервер.</p>:!data.available?<p className="model-runtime-note">{busy?'Сервис моделей перезапускается…':'Соединение с сервером моделей не установлено.'}</p>:<>
   <div className="model-runtime-actions"><Button variant="outline" disabled={busy||ready||!info?.configured_context} onClick={()=>void run('load')}><Download size={14}/>Загрузить</Button><Button variant="ghost" disabled={busy||unloaded||!info?.configured_context} onClick={()=>void run('unload')}><Power size={14}/>Выгрузить</Button></div>
   {info?.can_context&&<>
    <label className="model-runtime-label" htmlFor={controlId}>Размер контекста</label>
    <div className="model-runtime-context"><Select contentClassName={selectMenuClassName} id={controlId} aria-label="Размер контекста" value={custom?'custom':context} disabled={busy} onChange={e=>{setCustom(e.target.value==='custom');if(e.target.value!=='custom')setContext(e.target.value)}}>{presets.filter(n=>n<=(info.max_context||0)).map(n=><SelectOption key={n} value={n}>{n/1024}K · {n.toLocaleString('ru-RU')}</SelectOption>)}<SelectOption value="custom">Свой размер</SelectOption></Select><Button variant="outline" disabled={busy||!valid||Number(context)===info.configured_context} onClick={()=>void run('context')}><Check size={14}/>Применить</Button></div>
    <AnimatePresence initial={false}>{custom&&<motion.div className="model-runtime-custom" initial={settingsScope?{opacity:0}:{height:0,opacity:0}} animate={settingsScope?{opacity:1}:{height:'auto',opacity:1}} exit={settingsScope?{opacity:0,transition:{duration:reduced?0:.15,ease:'easeOut'}}:{height:0,opacity:0}} transition={{duration:reduced?0:.2,ease:[.23, 1, .32, 1]}}><input type="number" aria-label="Свой размер контекста" min={512} max={info.max_context} step={1} value={context} disabled={busy} onChange={e=>setContext(e.target.value)}/></motion.div>}</AnimatePresence>
    <p className="model-runtime-note">Общий для всех чатов этой модели. Применение перезапустит модель.{info.runtime_context?` Сейчас: ${info.runtime_context.toLocaleString('ru-RU')} токенов.`:''}{custom?` Максимум: ${info.max_context?.toLocaleString('ru-RU')}.`:''}</p>
   </>}
   {busy&&<p className="model-runtime-note" role="status">{!ownOperation?'Выполняется действие с другой моделью.':operation?.state==='waiting'?'Действие выполнится после текущей генерации.':'Можно продолжать пользоваться сайтом.'}</p>}
  </>}
  <AnimatePresence initial={false}>{displayedError&&<motion.p className="model-runtime-error" role="alert" initial={settingsScope?{opacity:0}:{opacity:0,height:0}} animate={settingsScope?{opacity:1}:{opacity:1,height:'auto'}} exit={settingsScope?{opacity:0,transition:{duration:reduced?0:.15,ease:'easeOut'}}:{opacity:0,height:0}} transition={{duration:reduced?0:.2}}>{displayedError}</motion.p>}</AnimatePresence>
 </section>;
}
