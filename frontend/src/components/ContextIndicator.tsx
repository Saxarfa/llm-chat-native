import './ContextIndicator.css';
import {HintButton} from './Hint';
import {useEffect,useMemo,useState} from 'react';
import {Popover} from 'radix-ui';
import {X,Pin} from '../icons';
import {ChatContextPanel} from './ChatContextPanel';
import {useChatContext} from '../chatContext';
import {Button,IconButton} from './primitives';
import {api,inferencePayload,useChatSelection} from '../store';
import {configFor} from '../domain';
import {contextUsage,contextCapacity} from '../contextUsage';
import type {State} from '../types';
const number=(n:number)=>n.toLocaleString('ru-RU');
const shortNumber=new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1});
const compact=(n:number)=>shortNumber.format(n).replace(/\s/g,'');
export function ContextIndicator({state,model,linear=false}:{state:State;model:string;linear?:boolean}){
 const subscription=model.startsWith('google-subscription/'),web=model.startsWith('gemini-web/');
 const active=state.chats.find(c=>c.id===state.active),live=useChatSelection(current=>current.lives[state.active]);
 const previousRequest=subscription?[...(active?.messages||[])].reverse().find(message=>message.role==='assistant'&&message.model===model&&typeof message.metrics?.promptTokens==='number')?.metrics?.promptTokens:undefined;
 const config=configFor(model,state.settings,active?.overrides||state.draftOverrides);
 const rawUsage=contextUsage(active?.messages||[],model,config.systemPrompt||'',live),context=useChatContext();
 const [measured,setMeasured]=useState<{key:string;scope:object;used:number;estimated:boolean;capacity?:number}>();
 const [revision,setRevision]=useState(0);
 // Token updates only change the meter. Rebuilding the request payload here
 // also formats the current date/time with Intl and serializes model settings
 // for every SSE chunk, even while no usage request can run. Capture a fresh
 // payload when the conversation/configuration or generation state changes.
 const payload=useMemo(()=>JSON.stringify(inferencePayload(state.active,model,active?.overrides||state.draftOverrides)),
  [state.active,active?.active_branch_id,model,state.settings,active?.overrides,state.draftOverrides,!!live,revision]);
 // Keep the previous reading visible during a refresh of this same context.
 // Switching model, branch or configuration still invalidates it immediately.
 const measurementScope=useMemo(()=>({}),[state.user?.id,state.active,context.branch,model,active?.updatedAt,context.data?.version,state.settings,active?.overrides,state.draftOverrides,!!live]);
 const measurementKey=JSON.stringify([state.active,context.branch,active?.updatedAt,context.data?.version,payload,revision]);
 useEffect(()=>{
  if(!active||live)return;
  let cancelled=false;
  const timer=setTimeout(()=>{void api(`/api/chats/${encodeURIComponent(active.id)}/context/usage`,'POST',JSON.parse(payload)).then(result=>{
   if(!cancelled&&Number.isFinite(result.used)&&result.used>=0)setMeasured({...result,key:measurementKey,scope:measurementScope});
  }).catch(()=>{})},180);
  return()=>{cancelled=true;clearTimeout(timer)};
 },[measurementKey,measurementScope,!!live]);
 const fallback=context.data?.compression&&!live?{...rawUsage,used:context.data.used_tokens+Math.ceil((config.systemPrompt||'').length/3),estimated:true}:rawUsage;
 const usage=live?rawUsage:measured?.scope===measurementScope?measured:fallback;
 const [managing,setManaging]=useState(false);
 useEffect(()=>{const open=()=>setManaging(true);window.addEventListener('open-chat-context',open);return()=>window.removeEventListener('open-chat-context',open)},[]);
 const [runtime,setRuntime]=useState<{scope:object;capacity:number}|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{const refresh=()=>setRevision(v=>v+1);const events=['model-runtime-updated','memory-updated','knowledge-updated'];events.forEach(name=>window.addEventListener(name,refresh));return()=>events.forEach(name=>window.removeEventListener(name,refresh))},[]);
 const savedEndpoint=state.settings.endpoint||'';
 const endpoint=savedEndpoint===location.origin+'/v1'||/^http:\/\/(localhost|127\.0\.0\.1):8000\/v1\/?$/.test(savedEndpoint)?'':savedEndpoint;
 const apiKey=state.settings.apiKey||'',generating=!!live;
 const runtimeScope=useMemo(()=>({}),[state.user?.id,model,endpoint,apiKey]);
 useEffect(()=>{
  let cancelled=false;
  // Opening details is a presentation action, never a probe/reset. Background
  // refreshes retain the last valid capacity for this exact connection.
  void api('/api/inference/probe','POST',{kind:'props',model,endpoint,apiKey}).then(data=>{if(!cancelled&&data.ok&&Number.isFinite(data.n_ctx)&&data.n_ctx>0)setRuntime({scope:runtimeScope,capacity:data.n_ctx})}).catch(()=>{});
  return()=>{cancelled=true};
 },[runtimeScope,generating,revision]);
 const configured=typeof config.contextSize==='number'&&Number.isFinite(config.contextSize)&&config.contextSize>0?config.contextSize:undefined;
 const capacity=subscription?131072:contextCapacity({
  live:live?.contextSize,
  runtime:runtime?.scope===runtimeScope?runtime.capacity:undefined,
  measured:!live&&measured?.scope===measurementScope?measured.capacity:undefined,
  configured,historical:rawUsage.capacity,
 });
 const remaining=capacity==null?undefined:Math.max(0,capacity-usage.used),percent=capacity?Math.min(100,Math.round(usage.used/capacity*100)):undefined;
 const approx=usage.estimated?'≈ ':'';
 const label=percent==null?'Контекст модели: лимит неизвестен':`Контекст модели: ${percent}% · использовано ${approx}${number(usage.used)}, осталось ${approx}${number(remaining!)} токенов`;
 return <><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><HintButton className={`context-trigger${linear?' context-trigger-linear':''}`} aria-label={label} hint="Контекст модели" data-level={percent!=null&&percent>=90?'high':percent!=null&&percent>=70?'medium':'normal'}>{linear?<><span className="context-linear-track" aria-hidden="true"><span style={{transform:`scaleX(${capacity?Math.min(1,Math.max(usage.used>0?.02:0,usage.used/capacity)):0})`}}/></span><span className="context-linear-value" aria-hidden="true"><span className="context-value-full">{approx}{number(usage.used)} / {capacity==null?'—':number(capacity)}</span><span className="context-value-short">{usage.estimated?'≈':''}{compact(usage.used)}<span className="context-value-limit"> / {capacity==null?'—':compact(capacity)}</span></span></span></>:<svg data-icon-motion="context" viewBox="0 0 36 36" aria-hidden="true"><circle className="context-ring-track" cx="18" cy="18" r="15"/><circle className="context-ring-fill" cx="18" cy="18" r="15" pathLength="100" strokeDasharray={`${percent??0} 100`}/></svg>}</HintButton></Popover.Trigger><Popover.Portal><Popover.Content className="context-popover floating-panel" align={linear?"start":"end"} sideOffset={6} collisionPadding={12}><header><strong>Контекст модели</strong><IconButton label="Закрыть контекст" showHint={false} onClick={()=>setOpen(false)}><X size={14}/></IconButton></header><div className="context-numbers"><div><span>{subscription?(usage.estimated?'Оценка запроса':'Токены запроса'):'Использовано'}</span><strong>{approx}{number(usage.used)}<small className="sr-only"> токенов</small></strong></div><div><span>{subscription?'Остаток бюджета':'Свободно'}</span><strong>{remaining==null?'—':approx+number(remaining)}<small className="sr-only"> токенов</small></strong></div></div><div className="context-meter"><span style={{transform:`scaleX(${(percent??0)/100})`}}/></div><footer><span>{subscription||web?'Бюджет приложения':'Лимит контекста'}</span><strong>{capacity==null?'Неизвестен':number(capacity)}</strong></footer>{web&&<p className="context-code-note">Оценка истории, инструкций и инструментов. Бюджет приложения — не лимит Google и не остаток подписки. Сжатие выполняет приложение; каждый запрос получает отдельный контекст.</p>}{(!web&&(subscription||live||!usage.estimated))&&<p className="context-code-note">{subscription?(usage.estimated?'Оценка истории и инструкций без служебного контекста Antigravity. Бюджет приложения — не лимит Gemini и не остаток подписки.':'Фактический запрос по данным Antigravity, включая служебный контекст. Бюджет приложения — не лимит Gemini и не остаток подписки.'):live?'Текущий запрос, включая результаты инструментов.':'Токены запроса по токенизатору модели, включая инструкции и инструменты.'}</p>}{subscription&&previousRequest!=null&&<p className="context-code-note">Последний запрос по данным сервиса: {number(previousRequest)} токенов, включая служебный контекст.</p>}{context.data?.covered_count? <p className="context-code-note">Сжато сообщений: {context.data.covered_count}. Оригиналы в истории.</p>:null}<Button className="context-manage-button" variant="ghost" onClick={()=>{setOpen(false);setManaging(true)}}><Pin size={14}/>Заметки и сжатие</Button></Popover.Content></Popover.Portal></Popover.Root><ChatContextPanel open={managing} onClose={()=>setManaging(false)}/></>;
}
