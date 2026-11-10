import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../store';
import {accountKey} from '../accountStorage';
import {pollVisible} from '../visiblePolling';
import {readNanoStream} from './nanoStream';
import {imageStudioRequestId} from './useImageStudioDraft';
import {nanoDefaults,nanoPending,nanoRequestError,nanoModelSettings,nanoTextOnly,nanoPath,nanoVideoDurationDraft,type NanoAsset,type NanoEntry,type NanoPart,type NanoSession,type NanoSettings,type NanoView} from './nanoTypes';
import type {StudioAIStudioConfig} from './studioTypes';

type Draft={text:string;assets:NanoAsset[];settings?:NanoSettings;videoDurationPrompt?:string};
type UploadTask={id:string;file:File;name:string;status:'uploading'|'failed';error?:string};
type Outgoing={session:string;payload:object;request_id:string};
type Continuation={session:string;target:string|null;previous:string|null;status:'switching'|'selected'|'failed'};
async function post(path:string,body:object){
 const response=await fetch(path,{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error(typeof data.detail==='string'?data.detail:'Запрос не принят'),{status:response.status});return data;
}
export function useNanoChat(userId:string,entry?:NanoEntry){
 const [sessions,setSessions]=useState<NanoSession[]>([]),[view,setView]=useState<NanoView|null>(null),[config,setConfig]=useState<StudioAIStudioConfig>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[connectionError,setConnectionError]=useState(''),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[draft,setDraft]=useState<Draft>({text:'',assets:[]}),[accepted,setAccepted]=useState(0);
 const [uploads,setUploads]=useState<UploadTask[]>([]);
 useEffect(()=>setUploads([]),[view?.session.id,userId]);
 const epoch=useRef(0),current=useRef<NanoView|null>(null),draftRef=useRef(draft),working=useRef(false),outgoing=useRef<Outgoing|null>(null),defaults=useRef(nanoDefaults),refreshing=useRef(false),optionsRevision=useRef<number|null>(null),savingOptions=useRef<Promise<boolean>|null>(null);
 draftRef.current=draft;
 const [continuation,setContinuation]=useState<Continuation|null>(null),continuationRef=useRef<Continuation|null>(null);
 const rememberContinuation=(value:Continuation|null)=>{continuationRef.current=value;setContinuation(value)};
 const streamHealthy=useRef(false);
 const selectionKey=accountKey('nano-selected'),draftKey=accountKey('nano-drafts'),outboxKey=accountKey('nano-outbox');
 const saveDraft=useCallback((id:string,value:Draft)=>{try{const all=JSON.parse(localStorage.getItem(draftKey)||'{}');all[id]=value;localStorage.setItem(draftKey,JSON.stringify(all))}catch{}},[draftKey]);
 const restoreDraft=(id:string)=>{try{return JSON.parse(localStorage.getItem(draftKey)||'{}')[id]||{text:'',assets:[]}}catch{return {text:'',assets:[]}}};
 useEffect(()=>{const id=current.current?.session.id;if(!id)return;const timer=setTimeout(()=>saveDraft(id,draft),400);return()=>clearTimeout(timer)},[draft,saveDraft]);
 useEffect(()=>{const persist=()=>{if(current.current)saveDraft(current.current.session.id,draftRef.current)};window.addEventListener('pagehide',persist);return()=>window.removeEventListener('pagehide',persist)},[saveDraft]);
 const rememberOutgoing=(value:Outgoing|null)=>{outgoing.current=value;try{if(value)sessionStorage.setItem(outboxKey,JSON.stringify(value));else sessionStorage.removeItem(outboxKey)}catch{};setUncertain(!!value)};
 const apply=(next:NanoView)=>{
  if(current.current?.session.id===next.session.id&&next.session.revision<current.current.session.revision)return;
  const previous=current.current?.active_job;
  if(previous&&next.active_job?.id===previous.id&&(next.active_job.stream_revision||0)<(previous.stream_revision||0))next={...next,active_job:previous};
  current.current=next;setView(next);
  const queued=outgoing.current;
  if(queued?.session===next.session.id&&next.messages.some(m=>m.role==='user'&&m.job.request_id===queued.request_id)){
   rememberOutgoing(null);setError('');setAccepted(v=>v+1);setDraft(value=>{const sent=queued.payload as {prompt:string;attachments:string[]};return value.text.trim()===sent.prompt?{...value,text:'',videoDurationPrompt:undefined,assets:value.assets.filter(a=>!sent.attachments.includes(a.id))}:value});
  }
 };
 const list=async()=>{const ticket=epoch.current;const data=await api('/api/images/edit-sessions');if(ticket===epoch.current)setSessions(data.sessions)};
 const select=async(id:string)=>{
  if(working.current)return;const prior=current.current;if(prior)saveDraft(prior.session.id,draftRef.current);
  const ticket=++epoch.current;optionsRevision.current=null;setLoading(true);setError('');setView(null);current.current=null;setDraft(restoreDraft(id));
  try{const next:NanoView=await api(`/api/images/edit-sessions/${encodeURIComponent(id)}`);if(ticket!==epoch.current)return;apply(next);sessionStorage.setItem(selectionKey,id)}catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Чат недоступен'))}finally{if(ticket===epoch.current)setLoading(false)}
 };
 const refresh=async()=>{if(refreshing.current)return;refreshing.current=true;const ticket=epoch.current,id=current.current?.session.id;try{const [listed,next]=await Promise.all([api('/api/images/edit-sessions'),id?api(`/api/images/edit-sessions/${encodeURIComponent(id)}`):Promise.resolve(null)]);if(ticket!==epoch.current)return;setSessions(listed.sessions);setConnectionError('');if(next)apply(next)}catch(e){if(ticket===epoch.current)setConnectionError(nanoRequestError(e,'Не удалось обновить чат'))}finally{refreshing.current=false}};
 const create=async(source?:string,fresh=false,repeat?:NanoEntry['repeat'],chosen?:NanoSettings,carry?:Draft)=>{
  if(working.current)return;working.current=true;setBusy(true);setError('');const prior=current.current;if(prior)saveDraft(prior.session.id,draftRef.current);const ticket=++epoch.current;
   try{const settings=repeat?(await api(`/api/images/${encodeURIComponent(repeat.id)}/nano-settings`)).settings:chosen||(fresh&&prior?prior.session.settings:defaults.current);const next:NanoView=await post('/api/images/edit-sessions',{...(source?{source_job_id:source,fresh}:{}),settings});if(ticket!==epoch.current)return;current.current=null;optionsRevision.current=null;apply(next);setDraft(repeat?{text:repeat.prompt,assets:[]}:carry||restoreDraft(next.session.id));sessionStorage.setItem(selectionKey,next.session.id);await list();setLoading(false);return true}catch(e){if(ticket===epoch.current){setError(nanoRequestError(e,'Не удалось создать чат'));setLoading(false)}}finally{working.current=false;setBusy(false)}
 };
 const methods=useRef({select,create,refresh,apply,list});methods.current={select,create,refresh,apply,list};
 useEffect(()=>{
  const id=view?.session.id;if(!id)return;
  let disposed=false,paused=false,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setTimeout>|undefined,delay=500;
  const connect=()=>{
   clearTimeout(timer);controller?.abort();clearTimeout(heartbeat);streamHealthy.current=false;
   if(disposed||paused||document.hidden)return;
   const attempt=new AbortController();controller=attempt;const ticket=epoch.current;
   const valid=()=>!disposed&&!attempt.signal.aborted&&ticket===epoch.current&&current.current?.session.id===id;
   const alive=()=>{if(!valid())return;streamHealthy.current=true;setConnectionError('');delay=500;clearTimeout(heartbeat);heartbeat=setTimeout(()=>attempt.abort(),15000)};
   heartbeat=setTimeout(()=>attempt.abort(),15000);
   void readNanoStream(`/api/images/edit-sessions/${encodeURIComponent(id)}/events`,attempt.signal,(kind,data)=>{
    if(!valid())return;
    if(kind==='snapshot'){methods.current.apply(data as NanoView);void methods.current.list().catch(()=>{})}
    else if(kind==='job'){
     const update=data as {revision:number;job:NanoView['active_job']},snapshot=current.current;
     if(snapshot&&update.revision===snapshot.session.revision&&snapshot.active_job?.id===update.job?.id&&(update.job?.stream_revision||0)>=(snapshot.active_job?.stream_revision||0)){const next={...snapshot,active_job:update.job};current.current=next;setView(next)}
    }else if(kind==='gone'){attempt.abort();void methods.current.refresh()}
   },alive).catch(()=>{
    if(disposed||paused||controller!==attempt)return;
    streamHealthy.current=false;clearTimeout(heartbeat);
    // A WebKit navigation can close the reader before pagehide. Never start
    // another fetch in that teardown window; the fallback poll owns recovery.
    if(!document.hidden){timer=setTimeout(connect,delay);delay=Math.min(delay*2,8000)}
   });
  };
  const hide=()=>{paused=true;streamHealthy.current=false;controller?.abort();clearTimeout(timer);clearTimeout(heartbeat)},show=()=>{paused=false;connect()};
  connect();document.addEventListener('visibilitychange',connect);window.addEventListener('online',connect);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{disposed=true;hide();document.removeEventListener('visibilitychange',connect);window.removeEventListener('online',connect);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show)};
 },[userId,view?.session.id]);
 useEffect(()=>{
  let alive=true;++epoch.current;current.current=null;working.current=false;optionsRevision.current=null;savingOptions.current=null;setView(null);setSessions([]);setConnectionError('');setError('');setDraft({text:'',assets:[]});
  try{outgoing.current=JSON.parse(sessionStorage.getItem(outboxKey)||'null');setUncertain(!!outgoing.current)}catch{}
  void(async()=>{try{
   const [catalog,settings,listed]=await Promise.all([api('/api/images/config?source=aistudio'),api('/api/images/studio-settings'),api('/api/images/edit-sessions')]);if(!alive)return;setConfig(catalog.aistudio);
   let legacy=settings.values;try{legacy={...legacy,...JSON.parse(sessionStorage.getItem(`image-studio-outbox-${userId}`)||'{}')}}catch{}
   defaults.current={...nanoDefaults,...Object.fromEntries(Object.entries(legacy).filter(([key])=>key in nanoDefaults))};setSessions(listed.sessions);
   if(entry||current.current)return;
   const migrationKey=accountKey('nano-draft-migrated');
   if(!localStorage.getItem(migrationKey)&&legacy.prompt){await methods.current.create();if(alive&&current.current){setDraft({text:legacy.prompt,assets:[]});localStorage.setItem(migrationKey,'1')}return}
   localStorage.setItem(migrationKey,'1');const stored=sessionStorage.getItem(selectionKey)??localStorage.getItem(selectionKey),id=listed.sessions.find((s:NanoSession)=>s.id===stored)?.id||listed.sessions[0]?.id;
   if(id)await methods.current.select(id);else await methods.current.create();
  }catch(e){if(alive){setError(nanoRequestError(e,'Не удалось открыть Nano Banana'));setLoading(false)}}})();
  let listedAt=0;
  const stop=pollVisible(async()=>{if(!streamHealthy.current)await methods.current.refresh();else if(Date.now()-listedAt>15000){await methods.current.list();listedAt=Date.now()}},3000),restored=()=>void methods.current.refresh();window.addEventListener('project-data-restored',restored);
  return()=>{alive=false;++epoch.current;stop();window.removeEventListener('project-data-restored',restored);if(current.current)saveDraft(current.current.session.id,draftRef.current)};
 },[userId]);
 useEffect(()=>{if(entry)void methods.current.create(entry.source?.id,false,entry.repeat)},[entry?.nonce]);
 useEffect(()=>{
  let alive=true,stop:(()=>void)|undefined;
  const updateDefaults=(values:Record<string,unknown>)=>{defaults.current={...nanoDefaults,...Object.fromEntries(Object.entries(values).filter(([key])=>key in nanoDefaults))} as NanoSettings};
  const receive=(event:Event)=>{const data=(event as CustomEvent<{user_id:string|number;values:Record<string,unknown>}>).detail;if(String(data.user_id)===userId)updateDefaults(data.values)};
  const interval=config?.available?30000:5000,timer=setTimeout(()=>{stop=pollVisible(async()=>{try{const [next,stored]=await Promise.all([api('/api/images/config?source=aistudio'),api('/api/images/studio-settings')]);if(alive){setConfig(next.aistudio);updateDefaults(stored.values)}}catch{}},interval)},interval);
  window.addEventListener('image-studio-settings-updated',receive);
  return()=>{alive=false;clearTimeout(timer);stop?.();window.removeEventListener('image-studio-settings-updated',receive)};
 },[userId,config?.available]);
 const flushOptions=async():Promise<boolean>=>{
  if(savingOptions.current)return savingOptions.current;
  const settings=draftRef.current.settings,snapshot=current.current,ticket=epoch.current;
  if(!settings||!snapshot)return true;if(nanoPending(snapshot.active_job))return false;
  const operation=(async()=>{try{const next=await api(`/api/images/edit-sessions/${snapshot.session.id}`,'PATCH',{settings,expected_revision:optionsRevision.current??snapshot.session.revision});if(ticket!==epoch.current)return false;apply(next);optionsRevision.current=null;setDraft(value=>value.settings===settings?{...value,settings:undefined}:value);return true}catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось сохранить параметры'));return false}finally{savingOptions.current=null}})();
  savingOptions.current=operation;return operation;
 };
 const flushRef=useRef(flushOptions);flushRef.current=flushOptions;
 useEffect(()=>{if(!draft.settings||busy||nanoPending(view?.active_job))return;const timer=setTimeout(()=>void flushRef.current(),650);return()=>clearTimeout(timer)},[draft.settings,busy,view?.active_job?.status]);
 const patch=async(values:object)=>{const id=current.current?.session.id,ticket=epoch.current;if(!await flushOptions()||ticket!==epoch.current||current.current?.session.id!==id)return false;const snapshot=current.current;if(!snapshot||working.current||nanoPending(snapshot.active_job))return false;working.current=true;setBusy(true);setError('');try{const next=await api(`/api/images/edit-sessions/${snapshot.session.id}`,'PATCH',{...values,expected_revision:snapshot.session.revision});if(ticket!==epoch.current)return false;apply(next);await list();return true}catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось сохранить чат'));return false}finally{working.current=false;setBusy(false)}};
 const selectHead=async(target:string|null,restore=false)=>{
  const snapshot=current.current;
  if(!snapshot||working.current||nanoPending(snapshot.active_job)||outgoing.current||continuationRef.current?.status==='switching')return false;
  const previous=continuationRef.current?.session===snapshot.session.id?continuationRef.current.previous:snapshot.session.head_id;
  rememberContinuation({session:snapshot.session.id,target,previous,status:'switching'});
  const ok=await patch({head_id:target});
  if(current.current?.session.id!==snapshot.session.id)return false;
  rememberContinuation(ok&&restore?null:{session:snapshot.session.id,target,previous,status:ok?'selected':'failed'});
  return ok;
 };
 useEffect(()=>{rememberContinuation(null)},[view?.session.id,userId]);
 const selectedSettings=draft.settings||view?.session.settings||defaults.current;
 const selectedConfig=config?.models?.find(model=>model.model===(selectedSettings.model||nanoDefaults.model))||config;
 const send=async(retry=false)=>{
  const branch=continuationRef.current;
  if(branch&&branch.session===current.current?.session.id&&branch.status!=='selected')return;
  const sendingSession=current.current?.session.id,sendingEpoch=epoch.current;
  if(!retry&&!await flushOptions())return;
  if(sendingEpoch!==epoch.current||sendingSession!==current.current?.session.id)return;
  const latestBranch=continuationRef.current;
  if(latestBranch&&latestBranch.session===sendingSession&&latestBranch.status!=='selected')return;
  const snapshot=current.current,value=draftRef.current;if(!snapshot||working.current||nanoPending(snapshot.active_job)||(!retry&&!value.text.trim())||!selectedConfig?.available)return;
  if(outgoing.current&&!retry){setError('Сначала подтвердите предыдущую отправку кнопкой «Повторить отправку».');return}
  const payload=retry&&outgoing.current?outgoing.current.payload:{parent_id:snapshot.session.head_id,prompt:value.text.trim(),attachments:value.assets.map(a=>a.id),settings:value.settings||snapshot.session.settings,expected_revision:snapshot.session.revision,request_id:imageStudioRequestId()};
  const queued=retry&&outgoing.current?outgoing.current:{session:snapshot.session.id,payload,request_id:(payload as {request_id:string}).request_id};
  if(queued.session!==snapshot.session.id){setError('Предыдущий запрос относится к другому чату. Откройте его для проверки.');return}
  rememberOutgoing(queued);working.current=true;setBusy(true);setError('');const ticket=epoch.current;
  try{await post(`/api/images/edit-sessions/${snapshot.session.id}/messages`,queued.payload);if(ticket===epoch.current){await refresh();setDraft(value=>({...value,settings:undefined}))}}
  catch(e){if(ticket===epoch.current){if((e as {status?:number}).status&&Number((e as {status:number}).status)<500)rememberOutgoing(null);setError(nanoRequestError(e,'Связь прервалась. Проверьте отправку; повтор безопасен.'));await refresh()}}
  finally{working.current=false;setBusy(false)}
 };
 const upload=async(files:File[])=>{
  if(working.current)return;const ticket=epoch.current,limit=selectedConfig?.max_references||14;if(draftRef.current.assets.length+files.length>limit){setError(`Можно прикрепить до ${limit} изображений`);return}working.current=true;setBusy(true);setError('');
  const tasks=files.map(file=>({id:imageStudioRequestId(),file,name:file.name,status:'uploading' as const}));setUploads(value=>[...value,...tasks]);let successful=true;
  try{for(const task of tasks){if(ticket!==epoch.current)return false;try{const file=task.file;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Нужен PNG, JPEG или WebP до 20 МБ');const response=await fetch('/api/images/nano/uploads',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':file.type},body:file});const asset=await response.json();if(!response.ok)throw Error(asset.detail||'Не удалось загрузить изображение');if(ticket===epoch.current){setDraft(value=>({...value,assets:[...value.assets,asset]}));setUploads(value=>value.filter(item=>item.id!==task.id))}}catch(e){successful=false;if(ticket===epoch.current)setUploads(value=>value.map(item=>item.id===task.id?{...item,status:'failed',error:nanoRequestError(e,'Не удалось загрузить изображение')}:item))}}return successful&&ticket===epoch.current}finally{working.current=false;setBusy(false)}
 };
 const gallery=async(id:string)=>{if(working.current)return false;const ticket=epoch.current;working.current=true;setBusy(true);setError('');try{if(draftRef.current.assets.length>=(selectedConfig?.max_references||14))throw Error('Достигнут предел вложений');const asset=await post(`/api/images/nano/gallery/${encodeURIComponent(id)}`,{});if(ticket!==epoch.current)return false;setDraft(value=>({...value,assets:[...value.assets,asset]}));return true}catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось прикрепить арт'));return false}finally{working.current=false;setBusy(false)}};
 const attachImage=async(part:Extract<NanoPart,{type:'image'}>)=>{
  if(working.current)return false;
  if(part.kind==='image'&&part.index===0)return gallery(part.id);
  // Resolve the exact part, including its index, rather than attaching the
  // first picture from a multi-image response.
  const ticket=epoch.current;working.current=true;setBusy(true);setError('');
  try{
   if(draftRef.current.assets.length>=(selectedConfig?.max_references||14))throw Error('Достигнут предел вложений');
   const source=part.kind==='nano_asset'?`/api/images/nano/uploads/${encodeURIComponent(part.id)}`:`/api/images/${encodeURIComponent(part.id)}/image/${part.index}`;
   const response=await fetch(source,{headers:window.storageManager.getAuthHeaders()});if(!response.ok)throw Error('Не удалось загрузить изображение');
   const blob=await response.blob();if(ticket!==epoch.current)return false;
   if(blob.size>20*1024*1024)throw Error('Нужен PNG, JPEG или WebP до 20 МБ');
   const asset=await fetch('/api/images/nano/uploads',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':blob.type},body:blob});const data=await asset.json();if(!asset.ok)throw Error(data.detail||'Не удалось прикрепить изображение');
   if(ticket!==epoch.current)return false;setDraft(value=>({...value,assets:[...value.assets,data]}));return true;
  }catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось прикрепить изображение'));return false}
  finally{working.current=false;setBusy(false)}
 };
 const prepareImage=(messageId:string)=>{
  const snapshot=current.current,branch=continuationRef.current;
  if(!snapshot||snapshot.session.head_id!==messageId||working.current||outgoing.current||uploads.length||nanoPending(snapshot.active_job)||draftRef.current.text.trim()||draftRef.current.assets.length||branch&&branch.status!=='selected')return false;
  const message=snapshot.messages.find(item=>item.id===messageId);
  if(!message||!nanoTextOnly(message))return false;
  const next={...draftRef.current,text:'Создай изображение по предыдущему запросу. Верни саму картинку, а не только её описание.',settings:{...(draftRef.current.settings||snapshot.session.settings),response_mode:'image' as const}};
  optionsRevision.current??=snapshot.session.revision;
  draftRef.current=next;setDraft(next);saveDraft(snapshot.session.id,next);return true;
 };
 const prepareRetry=async()=>{
  const snapshot=current.current;
  if(!snapshot||working.current||outgoing.current||nanoPending(snapshot.active_job)||draftRef.current.text.trim()||draftRef.current.assets.length)return false;
  const message=[...snapshot.messages].reverse().find(m=>m.role==='user'&&m.parent_id===snapshot.session.head_id&&['error','cancelled'].includes(m.job.status));
  if(!message)return false;
  const ticket=epoch.current;working.current=true;setBusy(true);setError('');
  try{
   const data=await api(`/api/images/${encodeURIComponent(message.job.id)}/nano-settings`);
   if(ticket!==epoch.current||draftRef.current.text.trim()||draftRef.current.assets.length)return false;
   const assets=message.content.filter((part):part is Extract<NanoPart,{type:'image'}>=>part.type==='image'&&part.kind==='nano_asset').map(part=>({id:part.id,name:'Вложение',mime:'image/png',width:0,height:0,size:0}));
   optionsRevision.current=current.current?.session.revision??null;
   setDraft({text:message.text,assets,settings:data.settings||snapshot.session.settings});return true;
  }catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось подготовить повтор'));return false}
  finally{working.current=false;setBusy(false)}
 };
 const rename=async(id:string,title:string)=>{if(id===current.current?.session.id)return patch({title});const session=sessions.find(s=>s.id===id);if(!session)return false;try{await api(`/api/images/edit-sessions/${id}`,'PATCH',{title,expected_revision:session.revision});await list();return true}catch(e){setError(nanoRequestError(e,'Не удалось переименовать чат'));return false}};
 const remove=async(id:string)=>{
  if(working.current)return false;
  if(outgoing.current?.session===id){setError('Сначала подтвердите предыдущую отправку в этом чате.');return false}
  working.current=true;setBusy(true);setError('');const ticket=++epoch.current;
  try{
   await api(`/api/images/edit-sessions/${encodeURIComponent(id)}`,'DELETE');
   if(ticket!==epoch.current)return false;
   const remaining=sessions.filter(session=>session.id!==id);setSessions(remaining);
   const wasSelected=current.current?.session.id===id;
   if(wasSelected){current.current=null;setView(null);sessionStorage.removeItem(selectionKey)}
   working.current=false;setBusy(false);
   if(wasSelected){if(remaining.length)await select(remaining[0].id);else await create()}
   else await list();
   return true;
  }catch(e){if(ticket===epoch.current)setError(nanoRequestError(e,'Не удалось удалить чат'));return false}
  finally{working.current=false;setBusy(false)}
 };
 const stop=async()=>{const job=current.current?.active_job;if(!job)return;try{await api(`/api/images/${job.id}/stop`,'POST');await refresh()}catch(e){setError(nanoRequestError(e,'Не удалось остановить ответ'))}};
 const chooseModel=async(model:StudioAIStudioConfig)=>{
  if(working.current||nanoPending(current.current?.active_job)||outgoing.current||!model.available)return false;
  if(model.model===(draftRef.current.settings||current.current?.session.settings||defaults.current).model)return true;
  if(!await flushOptions())return false;
  const settings=nanoModelSettings(draftRef.current.settings||current.current?.session.settings||defaults.current,model);
  if(current.current?.messages.length){return !!await create(undefined,false,undefined,settings,{...draftRef.current,settings:undefined})}
  return patch({settings});
 };
 return {uploads,retryUpload:(id:string)=>{const item=uploads.find(task=>task.id===id);if(item&&!working.current){if(draftRef.current.assets.length>=(selectedConfig?.max_references||14)){setError('Достигнут предел вложений. Удали одно изображение перед повтором.');return}setUploads(value=>value.filter(task=>task.id!==id));void upload([item.file])}},dismissUpload:(id:string)=>setUploads(value=>value.filter(task=>task.id!==id)),sessions,view,config:selectedConfig,models:config?.models||(config?[config]:[]),chooseModel,connectionError,dismissError:()=>setError(''),loading,busy,error,uncertain,draft,setDraft,accepted,select,create,patch,send,upload,gallery,attachImage,prepareRetry,remove,rename,stop,refresh,selectHead,continuation:continuation?.session===view?.session.id?continuation:null,returnToHead:()=>selectHead(continuationRef.current?.previous??null,true),settings:draft.settings||view?.session.settings||defaults.current,
  prepareImage,options:(values:Partial<NanoSettings>)=>{
   if(optionsRevision.current===null)optionsRevision.current=current.current?.session.revision??null;
   setDraft(value=>{
    const settings={...(value.settings||current.current?.session.settings||defaults.current),...values};
    const continuation=settings.model==='aistudio/gemini-omni-1.1-flash'&&nanoPath(current.current?.messages||[],current.current?.session.head_id||null).some(message=>message.role==='model');
    if(values.video_duration!==undefined&&continuation){const next=nanoVideoDurationDraft(value.text,values.video_duration,value.videoDurationPrompt);return {...value,settings,text:next.text,videoDurationPrompt:next.instruction}}
    return {...value,settings};
   });
  },
  saveDefaults:async()=>{try{const values=draftRef.current.settings||current.current?.session.settings||defaults.current;await api('/api/images/studio-settings','PATCH',{values});defaults.current={...values};return true}catch(e){setError(nanoRequestError(e,'Не удалось сохранить настройки'));return false}}};
}
