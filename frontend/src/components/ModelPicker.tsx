import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {HintButton} from './Hint';
import {accountKey} from '../accountStorage';
import {modelCategory,readModelPickerPreferences,moveModel,type ModelCategory,type ModelPickerPreferences} from '../modelPickerPreferences';
import {Fragment,useCallback,useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent as ReactKeyboardEvent,type MouseEvent as ReactMouseEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {Popover} from 'radix-ui';
import {Check,Loader2,Search,SlidersHorizontal,RefreshCw,Download,Power,Star,GripVertical,X,Cpu,Sparkles,Cloud,Brain,Globe,Link2,FileText,Wrench,ChevronLeft,ImagePlus,Images,Clapperboard,type IconComponent} from '../icons';
import {Avatar,Button} from './primitives';
import {configFor,isNanoModel,isOmniModel,modelName,nanoThinkingLevels,reasoningKind,studioOutputLimit,subscriptionLevels} from '../domain';
import {supportsPdf} from '../chatAttachments';
import {useSurfaceHeight} from '../useSurfaceHeight';
import {presetPresentation} from '../workspacePreset';
import {normalizePreset,type WorkspacePreset} from '../workspacePresets';
import {triggerHaptic} from '../haptics';
import {motionEasing} from '../motion';
import * as chat from '../store';
import type {State,Values} from '../types';
import './ModelPicker.css';

type Runtime={available:boolean;managed_endpoint:string;site_endpoints?:string[];models:{id:string;state:string;configured_context?:number}[];operation?:{model:string;state:string;error?:string}};
const endpoint=(value:string)=>value.replace(/\/$/,'').replace(/\/v1$/,'').replace('://localhost:','://127.0.0.1:');
const running=(data?:Runtime)=>!!data?.operation&&!['completed','failed'].includes(data.operation.state);
const modelIdentity=(id:string)=>id?.startsWith('google-subscription/')?id.replace(/-(low|medium|high)$/,''):id;
const categories:{id:ModelCategory;label:string}[]=[{id:'local',label:'Локальные'},{id:'studio',label:'AI Studio'},{id:'subscription',label:'Подписка'}];
const providerLabel=(id:string)=>id.startsWith('aistudio/')?'Google AI Studio':id.startsWith('gemini-web/')?'Gemini Web':id.startsWith('google-subscription/')?'Antigravity':'Локальная модель';
const ProviderIcon=(id:string):IconComponent=>isOmniModel(id)?Clapperboard:isNanoModel(id)?ImagePlus:id.startsWith('aistudio/')?Sparkles:modelCategory(id)==='subscription'?Cloud:Cpu;
const mediaGroup=(id:string)=>isOmniModel(id)?2:isNanoModel(id)?1:0;
const mediaGroupLabel=(id:string)=>['Текст','Изображения','Видео'][mediaGroup(id)];
const LONG_PRESS_MS=450;
const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
/** The capsule label rolls to a new value: the old text leaves upward, the new one rises into
 * place and the width follows. The element keeps its own text, so the ellipsis still works. */
function RollingText({text,className,hidden}:{text:string;className:string;hidden?:boolean}){
 const ref=useRef<HTMLSpanElement>(null),[shown,setShown]=useState(text),from=useRef(0),rolling=useRef(false);
 useLayoutEffect(()=>{
  if(text===shown)return;
  const el=ref.current;
  // A hidden twin (phone/desktop variant) or reduced motion swaps at once.
  if(!el||!el.offsetParent||reducedMotion()){setShown(text);return}
  from.current=el.getBoundingClientRect().width;rolling.current=true;
  const leave=el.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-45%)'}],{duration:90,easing:'ease-in',fill:'forwards'});
  leave.onfinish=()=>setShown(text);
  return()=>{leave.onfinish=null;leave.cancel()};
 },[text,shown]);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el||!rolling.current)return;rolling.current=false;
  const to=el.getBoundingClientRect().width;
  el.animate([{opacity:0,transform:'translateY(45%)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:motionEasing});
  if(Math.abs(to-from.current)>1)el.animate([{width:`${from.current}px`},{width:`${to}px`}],{duration:220,easing:motionEasing});
 },[shown]);
 return <span ref={ref} className={className} aria-hidden={hidden||undefined}>{shown}</span>;
}
export function ModelPicker({state,onProfile,selection,side='top'}:{state:State;onProfile?:(id:string)=>void;side?:'top'|'bottom';selection?:{model:string;onSelect:(id:string)=>void|Promise<void>;disabled?:boolean}}){
 const selected=selection?.model||chat.activeModel();
 const trigger=useRef<HTMLButtonElement>(null),searchInput=useRef<HTMLInputElement>(null),[availableBelow,setAvailableBelow]=useState<number>();
 const measureBelow=useCallback(()=>{
  const button=trigger.current,viewport=window.visualViewport;
  const available=button?Math.floor((viewport?viewport.offsetTop+viewport.height:window.innerHeight)-button.getBoundingClientRect().bottom-20):0;
  // Size before Radix runs flip, so a long list scrolls below the welcome
  // composer. A short viewport still allows Radix to use the space above.
  setAvailableBelow(side==='bottom'&&available>=240?available:undefined);
 },[side]);
 const [open,setOpen]=useState(false),[filter,setFilter]=useState(''),[presets,setPresets]=useSnapshotState<WorkspacePreset[]>([]),[runtime,setRuntime]=useSnapshotState<Runtime|undefined>(undefined),[busy,setBusy]=useState(''),[error,setError]=useState(''),[savingDefault,setSavingDefault]=useState(false);
 useLayoutEffect(()=>{
  if(!open)return;
  measureBelow();
  const viewport=window.visualViewport;
  window.addEventListener('resize',measureBelow);
  viewport?.addEventListener('resize',measureBelow);viewport?.addEventListener('scroll',measureBelow);
  return()=>{window.removeEventListener('resize',measureBelow);viewport?.removeEventListener('resize',measureBelow);viewport?.removeEventListener('scroll',measureBelow)};
 },[open,measureBelow]);
 const preferenceKey=accountKey('model-picker-preferences');
 const [saved,setSaved]=useState(()=>({key:preferenceKey,value:readModelPickerPreferences(preferenceKey,modelCategory(selected))}));
 const preferences=saved.key===preferenceKey?saved.value:readModelPickerPreferences(preferenceKey,modelCategory(selected));
 const category=preferences.category;
 const savePreferences=(value:ModelPickerPreferences)=>{setSaved({key:preferenceKey,value});try{localStorage.setItem(preferenceKey,JSON.stringify(value))}catch{/* Preferences remain usable when storage is full. */}};
 const dragging=useRef(''),suppressClick=useRef(0);
 // The detail card follows the hovered/focused row; on the phone sheet it opens by long press.
 const [inspected,setInspected]=useState(''),[sheetDetail,setSheetDetail]=useState(false),press=useRef<{timer:number;x:number;y:number}|null>(null);
 const [dragOver,setDragOver]=useState('');
 useEffect(()=>{setSaved({key:preferenceKey,value:readModelPickerPreferences(preferenceKey,modelCategory(selected))});const changed=(event:StorageEvent)=>{if(event.key===preferenceKey)setSaved({key:preferenceKey,value:readModelPickerPreferences(preferenceKey,modelCategory(selected))})};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed)},[preferenceKey]);
 const {surface:content,body,surfaceRef,animateHeight}=useSurfaceHeight(open);
 // Rows cascade only right after opening; a tab switch slides the new list in from its side.
 const [cascade,setCascade]=useState(false),[tabDir,setTabDir]=useState(0),marker=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!cascade)return;const timer=window.setTimeout(()=>setCascade(false),420);return()=>clearTimeout(timer)},[cascade]);
 const pointer=useRef(false),sequence=useRef(0),sending=useRef(false);
 const [refreshing,setRefreshing]=useState(false),[refreshResult,setRefreshResult]=useState(''),refreshPending=useRef(false);
 const refreshList=async()=>{if(refreshPending.current)return;refreshPending.current=true;setRefreshing(true);setRefreshResult('');setError('');try{const [status]=await Promise.all([chat.refreshModels(),new Promise(resolve=>setTimeout(resolve,450))]);window.dispatchEvent(new Event('model-runtime-updated'));window.dispatchEvent(new Event('workspace-presets-updated'));if(status==='offline'){setError('Не удалось обновить список: сервер недоступен');setRefreshResult('error')}else{setRefreshResult('done');chat.notify(status==='loading'?'Список обновлён. Сервер загружает модель':'Список моделей обновлён')}}catch(e){setRefreshResult('error');setError(e instanceof Error?e.message:String(e))}finally{refreshPending.current=false;setRefreshing(false)}};
 const actor=selection?undefined:chat.overrides().workspacePreset,selectedPresentation=selection?state.settings:presetPresentation(state.settings,chat.overrides()),selectedName=modelName(selected,selectedPresentation);
 const compact=matchMedia('(max-width:800px)').matches,shortName=actor?selectedName:selectedName.split(/\s+/)[0];
 const query=filter.trim().toLowerCase(),models=[...new Set([...state.models.map(m=>m.id),...Object.keys(state.settings.modelProfiles||{}),state.settings.model,selected])].filter(Boolean).filter(id=>!id.startsWith('google/')&&modelCategory(id)===category).filter(id=>!id.startsWith('google-subscription/')||id==='google-subscription/gemini-3.8-flash').filter(id=>id!=='local-model'||state.models.some(model=>model.id===id)).filter(id=>!selection||!isNanoModel(id)).filter(id=>`${id} ${modelName(id,state.settings)}`.toLowerCase().includes(query));
 const rank=(id:string)=>id.startsWith('gemini-web/')?(id.includes('argon')?0:id.includes('pro')?1:id.includes('flash-lite')?3:2):4;
 const position=new Map(preferences.order.map((id,index)=>[id,index]));
 models.sort((a,b)=>mediaGroup(a)-mediaGroup(b)||(position.get(a)??Number.MAX_SAFE_INTEGER)-(position.get(b)??Number.MAX_SAFE_INTEGER)||rank(a)-rank(b));
 const reorder=(source:string,target:string)=>savePreferences({...preferences,order:moveModel(preferences.order,models,source,target)});
 const actors=(selection?[]:presets).filter(preset=>!preset.model_id.startsWith('google/')&&modelCategory(preset.model_id)===category).filter(preset=>`${preset.name} ${preset.model_id} актёр`.toLowerCase().includes(query));
 const switchCategory=(next:ModelCategory)=>{
  if(next===category)return;
  triggerHaptic('selection');
  const options=content.current?.querySelector<HTMLElement>('.model-options');
  if(options)options.scrollTop=0;
  setCascade(false);setTabDir(Math.sign(categories.findIndex(item=>item.id===next)-categories.findIndex(item=>item.id===category)));animateHeight();
  savePreferences({...preferences,category:next});
  setInspected('');setSheetDetail(false);
 };
 useEffect(()=>{
  if(!open)return;let alive=true;setError('');
  const refresh=async()=>{const ticket=++sequence.current;try{const data=await chat.api('/api/models/runtime');if(alive&&ticket===sequence.current)setRuntime(data)}catch{if(alive&&ticket===sequence.current)setRuntime(undefined)}};
  const loadActors=()=>void chat.api('/api/workspace/presets').then(data=>{if(alive)setPresets(data.presets.map(normalizePreset))}).catch(()=>{if(alive)setError('Не удалось загрузить актёров')});
  const updated=()=>void refresh();const stopPolling=pollVisible(refresh,4000);loadActors();
  window.addEventListener('model-runtime-updated',updated);window.addEventListener('workspace-presets-updated',loadActors);
  return()=>{alive=false;sequence.current++;stopPolling();window.removeEventListener('model-runtime-updated',updated);window.removeEventListener('workspace-presets-updated',loadActors)};
 },[open,state.user?.id]);
 // The capsule shows a load that was started or seen in the menu; it keeps asking until that load ends.
 const loadingSelected=modelCategory(selected)==='local'&&!!runtime&&(runtime.models.find(item=>item.id===selected)?.state==='loading'||runtime.operation?.model===selected&&running(runtime));
 useEffect(()=>{
  if(open||!loadingSelected)return;let alive=true;
  const stop=pollVisible(async()=>{const ticket=++sequence.current;try{const data=await chat.api('/api/models/runtime');if(alive&&ticket===sequence.current)setRuntime(data)}catch{if(alive&&ticket===sequence.current)setRuntime(undefined)}},4000);
  return()=>{alive=false;sequence.current++;stop()};
 },[open,loadingSelected]);
 // The accent mark is one element that travels between rows instead of blinking off and on.
 useLayoutEffect(()=>{
  const el=marker.current;if(!open||!el)return;
  const row=el.parentElement?.querySelector<HTMLElement>('.model-option.selected');
  if(!row){el.style.opacity='0';delete el.dataset.key;return}
  // Rows that jump (first paint, filtering) take the mark with them at once.
  const travel=el.dataset.key===filter;
  if(!travel)el.style.transition='none';
  el.style.height=`${Math.max(0,row.offsetHeight-16)}px`;el.style.transform=`translateY(${row.offsetTop+8}px)`;el.style.opacity='1';
  if(!travel){void el.offsetHeight;el.style.transition=''}
  el.dataset.key=filter;
 });
 const requestEndpoint=selection?'':chat.inferencePayload().settings.endpoint||'';
 const supported=!requestEndpoint||endpoint(requestEndpoint)===endpoint(runtime?.managed_endpoint||'')||!!runtime?.site_endpoints?.some(base=>endpoint(base)===endpoint(requestEndpoint));
 const run=async(id:string,action:'load'|'unload')=>{
  if(sending.current||running(runtime)||!supported)return;sending.current=true;setBusy(id);setError('');
  try{const result=await chat.api('/api/models/runtime/'+encodeURIComponent(id),'POST',{action});setRuntime(old=>old?{...old,operation:result.operation}:old);window.dispatchEvent(new Event('model-runtime-updated'))}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{sending.current=false;setBusy('')}
 };
 const choose=async(id:string,preset?:WorkspacePreset)=>{
  if(sending.current||dragging.current||performance.now()<suppressClick.current)return;
  triggerHaptic('selection');sending.current=true;setBusy(preset?.id||id);setError('');
  try{
   if(selection)await selection.onSelect(id);
   else if(preset)await chat.selectPreset(preset);
   else await chat.selectModel(id);
   // Let the selection mark reach the new row before the sheet leaves.
   if(selection||compact){if(!reducedMotion())await new Promise(resolve=>setTimeout(resolve,120));setOpen(false)}
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{sending.current=false;setBusy('')}
 };
 const loadControl=(id:string,name:string)=>{
  if(modelCategory(id)!=='local')return null;
  const info=runtime?.models.find(item=>item.id===id),loaded=['loaded','ready'].includes(info?.state||''),working=busy===id||(runtime?.operation?.model===id&&running(runtime)),action=loaded?'unload':'load';
  return <HintButton type="button" className={`model-detail-action ${loaded?'is-loaded':''}`} hint={!runtime?'Проверяю состояние модели':!runtime.available?'Сервер моделей недоступен':!supported?'В подключении выбран другой сервер':!info?.configured_context?'Модель отсутствует в конфигурации управления':`${loaded?'Выгрузить':'Загрузить'} ${name}`} aria-label={`${loaded?'Выгрузить':'Загрузить'} ${name}`} disabled={!!busy||running(runtime)||!runtime?.available||!supported||!info?.configured_context} onClick={()=>void run(id,action)}>{working?<Loader2 size={14} className="spin"/>:loaded?<Power size={14}/>:<Download size={14}/>}<span>{loaded?'Выгрузить':'Загрузить'}</span></HintButton>;
 };
 const makeDefault=async(id:string)=>{triggerHaptic('star');setSavingDefault(true);try{await chat.saveSettings({model:id})}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSavingDefault(false)}};
 // Only facts the app actually knows: provider catalogs, llama-swap config and per-model capability tables.
 const facts=(id:string)=>{
  const entry=state.models.find(item=>item.id===id) as Values|undefined,info=runtime?.models.find(item=>item.id===id),local=modelCategory(id)==='local',studio=id.startsWith('aistudio/');
  const context=Number(entry?.context_length)||info?.configured_context||0,output=Number(entry?.output_limit)||(studio?studioOutputLimit(id):0);
  const kind=reasoningKind(id),levels=subscriptionLevels(id),caps:{icon:IconComponent;label:string}[]=[];
  if(kind)caps.push({icon:Brain,label:kind==='effort'&&levels?.length?`Рассуждения · ${levels.length} ур.`:'Рассуждения'});
  if(isNanoModel(id)){
   const features=(entry?.features||{}) as Record<string,boolean>,levels=features.thinking_level?nanoThinkingLevels[id]:undefined,image={icon:isOmniModel(id)?Clapperboard:Images,label:isOmniModel(id)?'Видео':'Изображения'};
   const nano=[image,...(levels?[{icon:Brain,label:`Рассуждения · ${levels.length} ур.`}]:[]),...(features.google_search?[{icon:Globe,label:'Google Search'}]:[]),...(features.image_search?[{icon:ImagePlus,label:'Поиск по картинкам'}]:[])];
   const available=entry?.available===true;
   return {context,output:0,caps:nano,status:!entry?'Нет в текущем подключении':available?'Доступна':String(entry.reason||'Недоступна'),ok:available};
  }
  if(studio)caps.push({icon:Globe,label:'Google Search'},{icon:Link2,label:'Чтение ссылок'});
  if(supportsPdf(id))caps.push({icon:FileText,label:'PDF'});
  if(local&&configFor(id,state.settings,{}).toolCallingEnabled!==false)caps.push({icon:Wrench,label:'Инструменты'});
  const loaded=['loaded','ready'].includes(info?.state||'');
  const text=local?(status(id)||(!runtime?'':!runtime.available?'Сервер моделей недоступен':info?'Не загружена':'Нет в конфигурации управления')):entry?'Доступна':'Нет в текущем подключении';
  return {context,output,caps,status:text,ok:local?loaded:!!entry};
 };
 const cancelPress=()=>{if(press.current){clearTimeout(press.current.timer);press.current=null}};
 useEffect(()=>()=>{if(press.current)clearTimeout(press.current.timer)},[]);
 const openDetail=(key:string)=>{cancelPress();suppressClick.current=performance.now()+700;triggerHaptic('selection');setInspected(key);setSheetDetail(true)};
 // Desktop: hover/focus retargets the card. Phone sheet: long press (or contextmenu) opens it.
 const rowHandlers=(key:string)=>compact?{
  onPointerDown:(event:ReactPointerEvent)=>{cancelPress();const x=event.clientX,y=event.clientY;press.current={x,y,timer:window.setTimeout(()=>openDetail(key),LONG_PRESS_MS)}},
  onPointerMove:(event:ReactPointerEvent)=>{const start=press.current;if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)cancelPress()},
  onPointerUp:cancelPress,onPointerCancel:cancelPress,onPointerLeave:cancelPress,
  onContextMenu:(event:ReactMouseEvent)=>{event.preventDefault();openDetail(key)},
 }:{onPointerEnter:(event:ReactPointerEvent)=>{if(event.pointerType==='mouse')setInspected(key)},onFocus:()=>setInspected(key)};
 const status=(id:string)=>{const info=runtime?.models.find(item=>item.id===id);return ['loaded','ready'].includes(info?.state||'')?'Загружена':runtime?.operation?.model===id&&running(runtime)?runtime.operation.state==='waiting'?'В очереди':'Переключение…':info?.state==='loading'?'Загружается':''};
 const optionsList=useRef<HTMLDivElement>(null),syncScrollFade=useCallback(()=>{const el=optionsList.current;if(!el)return;const overflow=el.scrollHeight-el.clientHeight>2;el.classList.toggle('is-overflowing',overflow);el.classList.toggle('is-at-top',!overflow||el.scrollTop<=1);el.classList.toggle('is-at-bottom',!overflow||el.scrollTop+el.clientHeight>=el.scrollHeight-1)},[]);
 useLayoutEffect(()=>{
  if(!open)return;
  const el=optionsList.current;if(!el)return;
  syncScrollFade();
  // Row heights change with runtime status text, so watch the content, not just the filter.
  const observer=new ResizeObserver(syncScrollFade);
  observer.observe(el);if(el.firstElementChild instanceof HTMLElement)observer.observe(el.firstElementChild);
  return()=>observer.disconnect();
 },[open,category,filter,models.length,actors.length,runtime,sheetDetail,syncScrollFade]);
 const handleKeyDown=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey)return;
  const active=document.activeElement as HTMLElement|null,inInput=active===searchInput.current;
  if(event.key==='Escape'&&filter){
   event.preventDefault();event.stopPropagation();
   setFilter('');searchInput.current?.focus({preventScroll:true});
   return;
  }
  if(!event.altKey&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
   const buttons=Array.from(optionsList.current?.querySelectorAll<HTMLButtonElement>('.model-option > button:first-child:not(:disabled)')||[]);
   if(!buttons.length)return;
   event.preventDefault();
   const current=buttons.findIndex(btn=>btn===active||(active&&btn.parentElement?.contains(active)));
   const selectedIdx=buttons.findIndex(btn=>btn.getAttribute('aria-pressed')==='true');
   const next=current===-1?(event.key==='ArrowDown'?(selectedIdx>=0?Math.min(selectedIdx+1,buttons.length-1):0):(selectedIdx>=0?Math.max(selectedIdx-1,0):buttons.length-1)):(current+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length;
   const target=buttons[next];
   target?.focus({preventScroll:true});
   target?.scrollIntoView({block:'nearest'});
   return;
  }
  if(!event.altKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&(!inInput||!filter)){
   event.preventDefault();
   const index=categories.findIndex(item=>item.id===category);
   const next=categories[(index+(event.key==='ArrowRight'?1:categories.length-1))%categories.length];
   if(next)switchCategory(next.id);
   return;
  }
  if(!inInput&&!event.altKey&&event.key.length===1&&event.key!==' '){
   searchInput.current?.focus({preventScroll:true});
  }
 };
 const failure=error||(runtime?.operation?.state==='failed'?runtime.operation.error:''),isSelectedDefault=modelIdentity(selected)===modelIdentity(state.settings.model);
 const keys=[...models,...actors.map(item=>'actor:'+item.id)];
 const inspectKey=keys.includes(inspected)?inspected:actor&&keys.includes('actor:'+actor.id)?'actor:'+actor.id:keys.includes(modelIdentity(selected))?modelIdentity(selected):keys[0]||'';
 const showDetail=!!inspectKey&&(!compact||sheetDetail);
 const lead=(id:string,name:string,avatar?:string)=>{if(avatar)return <Avatar src={avatar} name={name}/>;const Icon=ProviderIcon(id);return <span className="model-picker-lead" aria-hidden="true"><Icon size={14}/></span>};
 const detail=(key:string)=>{
  const preset=key.startsWith('actor:')?actors.find(item=>'actor:'+item.id===key):undefined,id=preset?preset.model_id:key;
  const name=preset?preset.name:modelName(id,state.settings),avatar=preset?preset.cover:state.settings.modelProfiles?.[id]?.avatar,info=facts(id),Icon=ProviderIcon(id);
  const isDefault=!preset&&modelIdentity(id)===modelIdentity(state.settings.model),chosen=preset?actor?.id===preset.id&&selected===preset.model_id:id===modelIdentity(selected)&&!actor;
  return <aside className="model-picker-detail" aria-label={`Подробности: ${name}`}>
   {compact&&<button type="button" className="model-detail-back" onClick={()=>setSheetDetail(false)}><ChevronLeft size={16}/>Все модели</button>}
   <div className="model-detail-head">{avatar?<Avatar src={avatar} name={name} size="detail"/>:<span className="model-detail-icon" aria-hidden="true"><Icon size={20}/></span>}<div><strong>{name}</strong><small>{preset?`Актёр · ${modelName(id,state.settings)}`:providerLabel(id)}</small></div></div>
   {info.caps.length>0&&<ul className="model-detail-caps">{info.caps.map(({icon:CapIcon,label})=><li key={label}><CapIcon size={14} aria-hidden="true"/>{label}</li>)}</ul>}
   <dl className="model-detail-facts">
    {info.context>0&&<><dt>Контекст</dt><dd title={info.context.toLocaleString('ru-RU')+' токенов'}>{info.context.toLocaleString('ru-RU')}</dd></>}
    {info.output>0&&<><dt>Ответ до</dt><dd>{info.output.toLocaleString('ru-RU')}</dd></>}
    {info.status&&<><dt>Статус</dt><dd><span className={`model-detail-dot ${info.ok?'is-ok':''}`} aria-hidden="true"/>{info.status}</dd></>}
   </dl>
   <div className="model-detail-actions">
    {compact&&!chosen&&<button type="button" className="model-detail-action is-primary" disabled={!!busy} onClick={()=>void choose(id,preset)}>{busy===(preset?.id||id)?<Loader2 size={14} className="spin"/>:<Check size={14}/>}<span>Выбрать</span></button>}
    {loadControl(id,name)}
    {!selection&&!preset&&(isDefault?<span className="model-detail-note"><Star size={14} fill="currentColor" aria-hidden="true"/>Для новых чатов</span>:<button type="button" className="model-detail-action" disabled={savingDefault} onClick={()=>void makeDefault(id)}>{savingDefault?<Loader2 size={14} className="spin"/>:<Star size={14}/>}<span>По умолчанию</span></button>)}
    {onProfile&&!preset&&<button type="button" className="model-detail-action" aria-label={`Профиль ${name}`} onClick={()=>onProfile(id)}><SlidersHorizontal size={14}/><span>Профиль</span></button>}
   </div>
  </aside>;
 };
 return <Popover.Root open={open} onOpenChange={value=>{if(value){measureBelow();setInspected('');setSheetDetail(false);setCascade(true);setTabDir(0)}if(!value){dragging.current='';setDragOver('');cancelPress()}setOpen(value)}}><Popover.Trigger asChild><button ref={trigger} onPointerDown={()=>{pointer.current=true}} onKeyDown={()=>{pointer.current=false}} className={`model-trigger ${compact?'is-compact':''}`} aria-label={selection?'Модель агента':'Выбрать модель'} disabled={selection?.disabled} data-loading={loadingSelected?'true':undefined}><Avatar key={selected} src={selectedPresentation.modelProfiles?.[selected]?.avatar} name={selectedName} size="picker"/><RollingText className="model-trigger-name" text={selectedName}/><RollingText className="model-trigger-short" text={shortName} hidden/></button></Popover.Trigger><Popover.Portal><Popover.Content ref={surfaceRef} tabIndex={-1} className={`model-menu floating-panel composer-menu model-picker-updated ${compact?'model-picker-sheet':'model-picker-split'}`} side={side} style={!compact&&availableBelow?{'--model-picker-preferred-height':`${availableBelow}px`,maxHeight:availableBelow} as CSSProperties:undefined} align="end" sideOffset={8} collisionPadding={12} onKeyDown={handleKeyDown} onEscapeKeyDown={event=>{if(sheetDetail){event.preventDefault();setSheetDetail(false);return}if(!filter)return;event.preventDefault();setFilter('');searchInput.current?.focus({preventScroll:true})}} onInteractOutside={event=>{
  // The profile is a separate modal layered over this picker.
  if(document.querySelector('.profile-modal'))event.preventDefault();
 }} onFocusOutside={event=>{
  if(document.querySelector('.profile-modal')){event.preventDefault();return}

  // Safari's haptic switch lives outside the popover. Its technical focus
  // must not dismiss the picker or leave keyboard navigation on a hidden input.
  if(event.target instanceof Element&&event.target.closest('[data-haptic-switch="true"]')){
   event.preventDefault();content.current?.focus({preventScroll:true});
  }
 }} onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus({preventScroll:true})}} onCloseAutoFocus={event=>{if(pointer.current||compact)event.preventDefault()}}>
  {/* The list stays mounted under the phone detail view, so order, search and scroll survive "back". */}
  <div ref={body} className={`model-picker-body ${compact&&showDetail?'is-detail':''}`}><header><div className="model-picker-categories" role="group" aria-label="Источник моделей" style={{'--category-index':categories.findIndex(item=>item.id===category)} as CSSProperties}><span className="model-picker-category-indicator" aria-hidden="true"/>{categories.map(item=><button key={item.id} type="button" aria-pressed={category===item.id} onClick={()=>switchCategory(item.id)}>{item.label}</button>)}</div><span className="sr-only" aria-live="polite">{refreshing?'Обновляю модели…':refreshResult==='done'?'Список обновлён':''}</span><HintButton type="button" className="icon-button" aria-label="Обновить модели" aria-busy={refreshing} disabled={refreshing} onClick={()=>void refreshList()}>{refreshing?<Loader2 size={16} className="spin"/>:refreshResult==='done'?<Check size={16}/>:<RefreshCw size={16}/>}</HintButton></header>
  <div className="model-search"><Search size={16}/><input ref={searchInput} placeholder="Поиск моделей и актёров" aria-label="Найти модель" value={filter} onChange={event=>setFilter(event.target.value)}/>{filter&&<HintButton type="button" className="model-search-clear icon-button" aria-label="Очистить поиск моделей" onClick={()=>{setFilter('');searchInput.current?.focus({preventScroll:true})}}><X size={14}/></HintButton>}</div>
   <div className="model-options" ref={optionsList} onScroll={syncScrollFade}><div className="model-picker-results" key={category} data-cascade={cascade&&!filter?'true':undefined} data-dir={tabDir||undefined} style={{'--tab-dir':tabDir} as CSSProperties}>{models.map((id,index)=>{const name=modelName(id,state.settings),chosen=id===modelIdentity(selected)&&!actor,isDefault=id===modelIdentity(state.settings.model),avatar=state.settings.modelProfiles?.[id]?.avatar;return <Fragment key={id}>{category==='subscription'&&(index===0||models[index-1].startsWith('gemini-web/')!==id.startsWith('gemini-web/'))&&<div className="model-picker-section">{id.startsWith('gemini-web/')?'Gemini Web':'Antigravity'}</div>}{category==='studio'&&models.some(isNanoModel)&&(index===0||mediaGroup(models[index-1])!==mediaGroup(id))&&<div className="model-picker-section">{mediaGroupLabel(id)}</div>}<div className={`model-option ${chosen?'selected':''} ${!compact&&inspectKey===id?'is-inspected':''} ${dragOver===id?'is-drag-over':''}`} key={id} data-model-id={id} draggable={!busy} onDragStart={event=>{cancelPress();dragging.current=id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id)}} onDragOver={event=>{if(dragging.current&&dragging.current!==id){event.preventDefault();event.dataTransfer.dropEffect='move';setDragOver(id)}}} onDrop={event=>{if(!dragging.current)return;event.preventDefault();reorder(dragging.current,id);dragging.current='';suppressClick.current=performance.now()+250;setDragOver('')}} onDragEnd={()=>{dragging.current='';suppressClick.current=performance.now()+250;setDragOver('')}} style={{'--model-row-delay':`${Math.min(index*12,108)}ms`} as CSSProperties}>
   <button type="button" aria-pressed={chosen} disabled={!!busy} onClick={()=>void choose(id)} onKeyDown={event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;const target=models[index+(event.key==='ArrowUp'?-1:1)];if(target){event.preventDefault();reorder(id,target)}}} title={compact?undefined:'Перетащите для изменения порядка · Alt + ↑/↓'} {...rowHandlers(id)}><GripVertical className="model-picker-drag-grip" size={14} aria-hidden="true"/>{lead(id,name,avatar)}<span><span className="model-picker-name"><strong>{name}</strong>{isDefault&&<span className="model-picker-default" title="Для новых чатов"><Star size={12} aria-hidden="true"/><span className="sr-only">Для новых чатов</span></span>}</span>{status(id)&&<small>{status(id)}</small>}</span></button>
  </div></Fragment>})}
  {actors.length>0&&<div className="model-picker-section">Актёры и пресеты</div>}{actors.map((preset,index)=>{const chosen=actor?.id===preset.id&&selected===preset.model_id,key='actor:'+preset.id;return <div className={`model-option ${chosen?'selected':''} ${!compact&&inspectKey===key?'is-inspected':''}`} key={'actor-'+preset.id} style={{'--model-row-delay':`${Math.min((models.length+index)*12,108)}ms`} as CSSProperties}><button type="button" aria-pressed={chosen} disabled={!!busy} onClick={()=>void choose(preset.model_id,preset)} {...rowHandlers(key)}><Avatar src={preset.cover} name={preset.name}/><span><strong>{preset.name}<span className="model-picker-actor">Актёр</span></strong><small>{modelName(preset.model_id,state.settings)}{status(preset.model_id)&&` · ${status(preset.model_id)}`}</small></span></button></div>})}
  {!models.length&&!actors.length&&<div className="model-empty"><p>{filter.trim()?'Ничего не найдено.':category==='local'?'Локальных моделей пока нет.':'Подключите '+(category==='studio'?'Google AI Studio':'подписку Google')+' в настройках подключения.'}</p>{category==='local'&&<Button variant="secondary" disabled={!filter.trim()||!!busy} onClick={()=>void choose(filter.trim())}>Использовать этот ID</Button>}</div>}
  <span ref={marker} className="model-picker-marker" aria-hidden="true"/></div></div>{showDetail&&detail(inspectKey)}{failure&&<p className="model-picker-error" role="alert">{failure}</p>}
  {compact&&!selection&&!isSelectedDefault&&<footer><button type="button" className="default-model-button" disabled={savingDefault} onClick={()=>void makeDefault(selected)}>{savingDefault?<Loader2 size={14} className="spin"/>:<Star size={14} fill="none"/>} Сделать по умолчанию</button></footer>}
 </div></Popover.Content></Popover.Portal></Popover.Root>;
}
