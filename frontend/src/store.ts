import {useRef,useSyncExternalStore} from 'react';
import {clockContext,configFor,mergeChat,reasoningKind} from './domain';
import {presetOverrides,withoutPreset,type PresetSnapshot} from './workspacePreset';
import {markMessageSent,type SentOrigin} from './messageMotion';
import {reconnectDelay} from './reconnectDelay';
import {accountKey} from './accountStorage';
import {diagnostic} from './diagnostics';
import {shareSnapshot} from './shareSnapshot';
import {chatLayoutEqual} from './chatLayout';
import {notifyWhenHidden} from './pwa';
import {triggerHaptic,triggerStreamTokenHaptic} from './haptics';
import type {State,Values,Chat,Message,Attachment,QueueItem,Live} from './types';
const storage=window.storageManager;
// A fresh token for each page lifetime; never written to browser storage.
const temporarySession=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
const temporaryId=(id:string)=>id?.startsWith('temp_');
export const requestHeaders=()=>({...storage.getAuthHeaders(),'X-Temporary-Session':temporarySession});
const closedTemporaryChats=new Set<string>();
let temporaryClosing:Promise<unknown>=Promise.resolve(),temporaryRevision=0;
const listeners=new Set<()=>void>();
const beforeViewListeners=new Set<(previous:State,next:State)=>void>();
/** Capture the rendered view before a chat/account/branch commit replaces it. */
export function subscribeBeforeChatViewChange(listener:(previous:State,next:State)=>void){beforeViewListeners.add(listener);return()=>{beforeViewListeners.delete(listener)}}
const viewKey=(value:State)=>`${value.user?.id??'guest'}:${value.active}:${value.chats.find(item=>item.id===value.active)?.active_branch_id||'main'}`;
let state:State={ready:false,user:null,chats:[],settings:storage.getSettings(),active:'new',draftModel:storage.getSettings().model,draftOverrides:{},models:[],lives:{},queues:[],connection:'connecting',inference:'unknown',error:'',toast:''};
export const getState=()=>state;
let sessionRevision=0,navigationRevision=0;
type NavigationOptions={branchId?:string;messageId?:string;query?:string};
let navigationRetry:{chatId:string;options:NavigationOptions;ticket:number;valid:()=>boolean}|undefined;
let streamFrame:number|undefined,streamNotifyTimer:ReturnType<typeof setTimeout>|undefined;
const notifyListeners=()=>{
 if(streamFrame!==undefined){cancelAnimationFrame(streamFrame);streamFrame=undefined}
 if(streamNotifyTimer!==undefined){clearTimeout(streamNotifyTimer);streamNotifyTimer=undefined}
 listeners.forEach(fn=>fn());
};
function notifyStream(){
 if(streamFrame!==undefined||streamNotifyTimer!==undefined)return;
 // SSE can arrive in a burst after a busy GPU/renderer or a delayed network read.
 // Keep every state update synchronous, but publish only the latest snapshot
 // before paint. The fallback also bounds delivery when rAF is suspended.
 if(typeof requestAnimationFrame==='function')streamFrame=requestAnimationFrame(notifyListeners);
 streamNotifyTimer=setTimeout(notifyListeners,40);
}
const emit=(patch:Partial<State>,stream=false)=>{
 if(patch.user!==undefined&&patch.user?.id!==state.user?.id){sessionRevision++;navigationRevision++;navigationRetry=undefined;patch={...patch,navigation:undefined}}
 const previous=state,next={...state,...patch};
 if((patch.active!==undefined||patch.chats!==undefined||patch.user!==undefined)&&viewKey(previous)!==viewKey(next))for(const listener of beforeViewListeners){try{listener(previous,next)}catch{/* A bookmark must never interrupt the accepted state commit. */}}
 state=next;
 if(patch.active!==undefined&&state.user){try{sessionStorage.setItem('llm-active-chat-'+state.user.id,temporaryId(state.active)?'new':state.active)}catch{}}
 if(stream)notifyStream();else notifyListeners();
};
class AccountChanged extends Error {constructor(){super('Аккаунт изменился. Повторите действие.')}}
function accountScope(){const owner=state.user?.id,revision=sessionRevision;return()=>owner===state.user?.id&&revision===sessionRevision}
// Mobile resume can fire visibility, online and SSE-connected together. Keep
// one read in flight and one trailing refresh, without publishing an obsolete
// result. A new account gets its own task immediately.
function coalescedRefresh<T>(refresh:(current:()=>boolean)=>Promise<T>){
 let pending:{valid:()=>boolean;again:boolean;promise:Promise<T>}|undefined;
 return()=>{
  if(pending?.valid()){pending.again=true;return pending.promise}
  const job={valid:accountScope(),again:false,promise:undefined as unknown as Promise<T>};
  pending=job;
  job.promise=(async()=>{
   let result!:T;
   do{
    job.again=false;
    try{result=await refresh(()=>job.valid()&&!job.again)}
    catch(error){if(!job.valid()||!job.again)throw error}
   }while(job.valid()&&job.again);
   return result;
  })().finally(()=>{if(pending===job)pending=undefined});
  return job.promise;
 };
}
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
export const useChat=()=>useSyncExternalStore(subscribe,getState);
export const useChatLayout=()=>useChatSelection(getState,chatLayoutEqual);
// Small controls in historical messages must not render on every streamed chunk.
export function useChatSelection<T>(select:(state:State)=>T,equal:(a:T,b:T)=>boolean=Object.is){
 const selected=useRef<{value:T}>(undefined);
 return useSyncExternalStore(subscribe,()=>{
  const value=select(state);
  if(!selected.current||!equal(selected.current.value,value))selected.current={value};
  return selected.current.value;
 });
}
function expireSession(){void endTemporaryChat();abort?.abort();storage.clearAuthSession();emit({user:null,chats:[],models:[],lives:{},queues:[],active:'new',draftOverrides:{},settings:storage.getSettings(),error:'',toast:'',searchTarget:undefined,undoChat:undefined})}
const chatRevision:Record<string,number>={},streamRevision:Record<string,number>={},loadRevision:Record<string,number>={},streamFirstTokenFired:Record<string,boolean>={};
let initialized=false,abort:AbortController|undefined,toastTimer:ReturnType<typeof setTimeout>,reconnecting=false,hiddenSince=0,lastStreamActivity=0;
let queueBusy=false,pollBusy=false,searchRequest=0;
let settingsError='';
const overrideWrites:Record<string,Promise<unknown>>={};
const pendingOverrides:Record<string,Values>={};
const connectionFailures=new WeakSet<object>();
export function notify(message:string){emit({toast:message,undoChat:undefined});clearTimeout(toastTimer);toastTimer=setTimeout(()=>emit({toast:''}),3500)}
export function failure(error:unknown){if(!(error instanceof AccountChanged))emit({error:error instanceof Error?error.message:String(error)})}
class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
function syncFailure(error:unknown){
 // Background reads retry on reconnect/polling. Keep actionable HTTP errors,
 // but do not leave a network banner after the stream has already recovered.
 if(error&&typeof error==='object'&&connectionFailures.has(error)||error instanceof ApiError&&(error.status===408||error.status>=500))return;
 failure(error);
}
export async function api(path:string,method='GET',body?:unknown,timeoutMs=25000){
 const owner=state.user?.id,valid=accountScope();
 try{
  const response=await fetch(path,{method,headers:requestHeaders(),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)}).catch(error=>{
   if(error instanceof TypeError||error instanceof DOMException&&['TimeoutError','AbortError'].includes(error.name))connectionFailures.add(error);
   throw error;
  });
  const data=await response.json().catch(()=>({}));
  if(!valid())throw new AccountChanged();
  if(response.status===401&&owner)expireSession();
  if(!response.ok)throw new ApiError(typeof data.detail==='string'?data.detail:data.detail?.message||`Ошибка ${response.status}. Попробуйте ещё раз.`,response.status);
  return data;
 }catch(error){if(!valid())throw new AccountChanged();throw error}
}
function cacheChat(chat:Chat){const previous=state.chats.find(item=>item.id===chat.id);if(pendingOverrides[chat.id])chat={...chat,overrides:pendingOverrides[chat.id]};const shared=previous?shareSnapshot(previous,chat):chat;if(!temporaryId(chat.id)&&shared!==previous)storage.applyRemoteChat(shared);return shared;}
function applyChat(chat:Chat){if(closedTemporaryChats.has(chat.id))return;const shared=cacheChat(chat);if(state.chats.find(item=>item.id===chat.id)!==shared)emit({chats:mergeChat(state.chats,shared)});}
async function mutateChat(id:string,path:string,method:string,body:unknown){
 const valid=accountScope();
 const revision=chatRevision[id]||0;
 const result=await api(path,method,body);
 if(!valid())throw new AccountChanged();
 const unchanged=revision===(chatRevision[id]||0);
 chatRevision[id]=(chatRevision[id]||0)+1;
 if(unchanged&&result.chat)applyChat(result.chat);else await loadChat(id);
 return result;
}
export function currentChat(){return state.chats.find(c=>c.id===state.active)}
export function activeModel(){return currentChat()?.model_id || state.draftModel || state.settings.model || 'local-model'}
export function overrides(){return currentChat()?.overrides || state.draftOverrides}
export function inferencePayload(chatId=state.active,model=activeModel(),over=overrides()){
 const s=state.settings,c=configFor(model,s,over),mode=over.searchMode ?? s.searchMode ?? 'disabled';
 // A same-origin /v1 endpoint always means the server's configured upstream.
 let endpoint=s.endpoint || '';
 if(endpoint===`${location.origin}/v1` || /^http:\/\/(localhost|127\.0\.0\.1):8000\/v1\/?$/.test(endpoint))endpoint='';
 return {chat_id:chatId,expected_branch_id:state.chats.find(chat=>chat.id===chatId)?.active_branch_id||'main',model,settings:{...c,endpoint,apiKey:s.apiKey},overrides:over,system_prompt:c.systemPrompt,...clockContext(),thinking:reasoningKind(model)==='toggle'?(c.thinking??over.thinking??true):true,web_search:mode!=='disabled',search_mode:mode,search_provider:s.searchProvider,searxng_url:s.searxngUrl,tavily_api_key:s.tavilyApiKey,search_max_results:s.searchMaxResults,search_blacklist:s.searchBlacklist};
}
type ChatSnapshot={id:string;chat:Chat;status:Values;revision:number;stream:number;ticket:number;valid:()=>boolean};
async function readChatSnapshot(id:string):Promise<ChatSnapshot|undefined>{
 if(closedTemporaryChats.has(id))return;
 const valid=accountScope();
 const revision=chatRevision[id]||0, stream=streamRevision[id]||0,ticket=(loadRevision[id]||0)+1;
 loadRevision[id]=ticket;
 let status;
 try{status=await api(`/api/chat/status/${encodeURIComponent(id)}`)}catch(error){if(closedTemporaryChats.has(id))return;if(temporaryId(id)&&error instanceof ApiError&&error.status===404){void endTemporaryChat();notify('Временный чат завершён');return}throw error}
 if(!valid()||closedTemporaryChats.has(id))return;
 // New servers return history and stream state together. Keep compatibility
 // with an older server while the frontend/backend update is being applied.
 const data=status.chat?status:await api(`/api/chats/${encodeURIComponent(id)}`);
 if(!valid()||closedTemporaryChats.has(id))return;
 const chat=status.chat||data.chat;
 if(!chat||chat.id!==id||!Array.isArray(chat.messages))throw new Error('Не удалось получить историю выбранного диалога. Повторите попытку.');
 return {id,chat,status,revision,stream,ticket,valid};
}
function publishChatSnapshot(snapshot:ChatSnapshot,presentation:Partial<State>={}){
 const {id,chat,status,revision,stream,ticket,valid}=snapshot;
 if(!valid()||closedTemporaryChats.has(id)||loadRevision[id]!==ticket)return false;
 const patch:Partial<State>={};
 // Idle status includes history from the same server snapshot. A separate
 // history request may have finished just before the assistant was persisted.
 if((chatRevision[id]||0)===revision){const shared=cacheChat(chat);if(state.chats.find(item=>item.id===id)!==shared)patch.chats=mergeChat(state.chats,shared);Object.assign(patch,queuedAcknowledgement(chat,!!status.is_generating))}
 if((streamRevision[id]||0)===stream){
  const lives={...state.lives};
  if(state.lives[id]&&!status.is_generating)diagnostic('client.recovery',{
   trace_id:state.lives[id].trace_id,state:'completion_from_status',saved:!!status.chat});
  if(status.is_generating)lives[id]=shareSnapshot(state.lives[id]||{chat_id:id},{chat_id:id,...status.snapshot,restored:true});else{if(state.lives[id])notifyWhenHidden('LLM Chat','Ответ модели готов',`chat-${id}`,{chatId:id});delete lives[id]}
  patch.lives=shareSnapshot(state.lives,lives);
 }
 const existing=(patch.chats||state.chats).find(item=>item.id===id);
 if(presentation.active&&!existing)return false;
 const recovered=patch.queues?state.queues.length-patch.queues.length:0;
 emit({...patch,...presentation});
 if(patch.queues){queuesSave();diagnostic('client.recovery',{state:'send_recovered',count:recovered})}
 return true;
}
export async function loadChat(id:string){
 const snapshot=await readChatSnapshot(id);
 if(snapshot)publishChatSnapshot(snapshot);
}
const reconcile=coalescedRefresh(async current=>{
 const revision=JSON.stringify(chatRevision);
 const data=await api('/api/chats');
 if(!current())return;
 if(revision===JSON.stringify(chatRevision)){
  const previous=new Map(state.chats.map(item=>[item.id,item]));
  const chats:Chat[]=data.chats.map((item:Chat)=>{
   const next=pendingOverrides[item.id]?{...item,overrides:pendingOverrides[item.id]}:item;
   return previous.has(item.id)?shareSnapshot(previous.get(item.id)!,next):next;
  });
  const shared=shareSnapshot(state.chats,[...chats,...state.chats.filter(item=>temporaryId(item.id))]);
  if(shared!==state.chats){storage.saveChatsLocally(chats);emit({chats:shared})}
 }
 await storage.refreshSettingsFromServer();if(!current())return;emit({settings:shareSnapshot(state.settings,storage.getSettings())});
 if(state.active!=='new'&&!state.chats.some(c=>c.id===state.active))newChat();
 // Queued turns in other chats also need fresh status after a reconnect.
 const ids=new Set([...Object.keys(state.lives),...state.queues.map(q=>q.chatId),...(state.active==='new'?[]:[state.active])]);
 await Promise.all([...ids].filter(id=>state.chats.some(c=>c.id===id)).map(id=>loadChat(id)));
});
function queuesSave(){try{sessionStorage.setItem(accountKey('llm-react-queue'),JSON.stringify(state.queues.filter(item=>!temporaryId(item.chatId))))}catch{notify('Очередь доступна до закрытия этой вкладки')}}
function queuedAcknowledgement(chat:Chat,generating=false):Partial<State>{
 // Only server history confirms acceptance. Optimistic local messages must not
 // clear retries when the request never reached the server.
 const accepted=state.queues.filter(item=>{
  if(item.chatId!==chat.id||item.payload.expected_branch_id&&(chat.active_branch_id||'main')!==item.payload.expected_branch_id)return false;
  const index=chat.messages.findIndex(message=>message.id===item.id&&message.role==='user');
  return index>=0&&(generating||chat.messages.slice(index+1).some(message=>message.role==='assistant'));
 });
 if(!accepted.length)return {};
 const ids=new Set(accepted.map(item=>item.id));
 const queues=state.queues.filter(item=>!ids.has(item.id));
 const errorCleared=accepted.some(item=>item.failed&&item.failed===state.error)&&!queues.some(item=>item.failed===state.error);
 return {queues,...(errorCleared?{error:''}:{})};
}
function acknowledgeQueued(chat:Chat,generating=false){
 const patch=queuedAcknowledgement(chat,generating);if(!patch.queues)return;
 const recovered=state.queues.length-patch.queues.length;
 emit(patch);queuesSave();
 diagnostic('client.recovery',{state:'send_recovered',count:recovered});
}
function removeQueue(id:string){emit({queues:state.queues.filter(q=>q.id!==id)});queuesSave()}
export const cancelQueue=removeQueue;
function forgetChat(id:string){
 chatRevision[id]=(chatRevision[id]||0)+1;streamRevision[id]=(streamRevision[id]||0)+1;
 const lives={...state.lives};delete lives[id];
 storage.removeChatLocally?.(id);
  emit({chats:state.chats.filter(c=>c.id!==id),queues:state.queues.filter(q=>q.chatId!==id),lives});queuesSave();
 if(state.active===id)newChat();
}
async function runQueue(){
 if(queueBusy)return;
 const item=state.queues.find(q=>!q.failed&&!state.lives[q.chatId]);if(!item)return;
 queueBusy=true;
 diagnostic('client.queue',{state:'sending',count:state.queues.length});
 const valid=accountScope();
 try{await transmit(item);if(valid())removeQueue(item.id)}catch(e){if(valid()&&!closedTemporaryChats.has(item.chatId)){emit({queues:state.queues.map(q=>q.id===item.id?{...q,failed:e instanceof Error?e.message:String(e)}:q)});queuesSave();failure(e)}}finally{queueBusy=false;void runQueue();}
}
export async function retryQueue(id:string){const item=state.queues.find(q=>q.id===id);if(!item)return;emit({queues:state.queues.map(q=>q.id===id?{...q,failed:undefined}:q)});await runQueue()}
async function onEvent(event:Values){
 const valid=accountScope();
 if(!state.user||(event.user_id!=null&&String(event.user_id)!==String(state.user.id)))return;
 const id=event.chat_id,type=event.type;
 if(temporaryId(id)&&!state.chats.some(item=>item.id===id))return;
 if(type==='auth_expired'){expireSession();return;}
 if(type==='connected')diagnostic('client.connection',{state:'connected'});
 if(['stream_start','stream_end','stream_stop'].includes(type))diagnostic('client.stream',{
  trace_id:event.trace_id,state:type,characters:(event.final_message?.content||'').length,
  stopped:type==='stream_stop',saved:!!event.chat});
 if(type==='connected'){emit({connection:'online'});await reconcile();if(!valid())return;window.dispatchEvent(new Event('workspace-presets-updated'));window.dispatchEvent(new Event('memory-updated'));window.dispatchEvent(new Event('chat-context-updated'));void runQueue();return;}
 if(type==='chat_context_updated'){window.dispatchEvent(new CustomEvent('chat-context-updated',{detail:event}));return}
 if(type==='video_settings_updated'){window.dispatchEvent(new CustomEvent('video-settings-updated',{detail:event}));return}
 if(type==='video_jobs_updated'){window.dispatchEvent(new CustomEvent('video-jobs-updated',{detail:event}));return}
 if(type==='image_settings_updated'){window.dispatchEvent(new CustomEvent('image-settings-updated',{detail:event}));return}
 if(type==='image_studio_settings_updated'){window.dispatchEvent(new CustomEvent('image-studio-settings-updated',{detail:event}));return}
 if(type==='workspace_presets_updated'){window.dispatchEvent(new CustomEvent('workspace-presets-updated',{detail:event}));return}
 if(type==='knowledge_updated'){window.dispatchEvent(new CustomEvent('knowledge-updated',{detail:event}));return}
 if(type==='memory_updated'){window.dispatchEvent(new CustomEvent('memory-updated',{detail:event}));if(event.origin==='model'||event.origin==='chat')notify('Память обновлена');return}
 if(type==='settings_updated'){storage.applyRemoteSettings(event);emit({settings:storage.getSettings()});return}
 if(type==='model_runtime_updated'){window.dispatchEvent(new CustomEvent('model-runtime-updated',{detail:event}));if(['completed','failed'].includes(event.operation?.state))void refreshModels();return}
 if(type==='provider_models_updated'){void refreshModels();return}
 if(type==='user_profile_updated'){storage.currentUser=event.user;emit({user:event.user});return}
 if(type==='lora_library_updated'){window.dispatchEvent(new Event('lora-library-updated'));return}
 if(type==='chat_trash_updated'){window.dispatchEvent(new Event('chat-trash-updated'));return}
 if(type==='chat_folders_updated'){window.dispatchEvent(new Event('chat-folders-updated'));void reconcile().catch(syncFailure);return}
 if(type==='project_data_restored'){void reconcile().catch(syncFailure);window.dispatchEvent(new Event('chat-folders-updated'));window.dispatchEvent(new Event('chat-trash-updated'));window.dispatchEvent(new Event('project-data-restored'));return}
 if(type==='chat_deleted'){forgetChat(id);return}
 if(type==='all_chats_cleared'){for(const chatId of new Set([...state.chats.map(c=>c.id),...state.queues.map(q=>q.chatId),...Object.keys(state.lives)]))forgetChat(chatId);newChat();return}
 if(!id)return;
 if(type.startsWith('stream_'))streamRevision[id]=(streamRevision[id]||0)+1;
 if(type==='stream_start'){
  streamFirstTokenFired[id]=false;
  if(event.chat)chatRevision[id]=(chatRevision[id]||0)+1;
  const startingChat=event.chat?cacheChat(event.chat):undefined;
  emit({...(startingChat?{chats:mergeChat(state.chats,startingChat)}:{}),lives:{...state.lives,[id]:{chat_id:id,...event,phase:event.phase||'Обработка запроса…'}}});
  if(event.chat)acknowledgeQueued(event.chat,true);
  // The initiating request has already been saved; fetch missed user turns too.
  const revision=chatRevision[id]||0,stream=streamRevision[id]||0;
  void api(`/api/chats/${encodeURIComponent(id)}`).then(d=>{if(state.lives[id]&&revision===(chatRevision[id]||0)&&stream===(streamRevision[id]||0))applyChat(d.chat)}).catch(syncFailure);
 }else if(['stream_chunk','stream_phase','stream_tool','stream_image'].includes(type)){
  if(state.active===id){
   if(type==='stream_chunk'){
    const nextText=typeof event.text==='string'?event.text:typeof event.content==='string'?event.content:'';
    if(!streamFirstTokenFired[id]&&nextText.trim().length>0){streamFirstTokenFired[id]=true;triggerHaptic('first_token')}
    else if(nextText.length>0)triggerStreamTokenHaptic(nextText);
   }else if(type==='stream_phase'||type==='stream_tool'){
    triggerHaptic('phase');
   }
  }
  emit({lives:{...state.lives,[id]:shareSnapshot(state.lives[id]||{chat_id:id},{...state.lives[id],...event,restored:false})}},true);
 }else if(type==='stream_end'||type==='stream_stop'){
  delete streamFirstTokenFired[id];
  chatRevision[id]=(chatRevision[id]||0)+1;
  const chat=event.chat?cacheChat(event.chat):undefined;
  const lives={...state.lives};delete lives[id];emit({lives,...(chat?{chats:mergeChat(state.chats,chat)}:{})});
  if(chat)acknowledgeQueued(chat);
  if(event.final_message?.metrics?.error && state.active===id){triggerHaptic('error');failure(event.final_message.metrics.error);}
  else if(type==='stream_end'){if(state.active===id)triggerHaptic('complete');notifyWhenHidden('LLM Chat','Ответ модели готов',`chat-${id}`,{chatId:id});}
  void runQueue();
 }else if(type==='chat_updated'){
  chatRevision[id]=(chatRevision[id]||0)+1;
  if(event.chat)applyChat(event.chat);else void loadChat(id).catch(syncFailure);
 }else if(type==='chat_metadata'||type==='chat_preferences'){
  chatRevision[id]=(chatRevision[id]||0)+1;
  const chat=state.chats.find(c=>c.id===id);if(chat)applyChat({...chat,...(type==='chat_preferences'?{overrides:pendingOverrides[id]||event.overrides}:{title:event.title??chat.title,title_source:event.title_source??chat.title_source,title_version:event.title_version??chat.title_version,model_id:event.model_id??chat.model_id,pinned:event.pinned??chat.pinned,folder_id:Object.hasOwn(event,'folder_id')?event.folder_id:chat.folder_id,updatedAt:event.updated_at??chat.updatedAt})});
 }
}
async function connect(){
 if(reconnecting)return;reconnecting=true;
 while(state.user){
  const valid=accountScope(),controller=new AbortController();abort=controller;
  let heartbeat:ReturnType<typeof setTimeout>;
  const alive=()=>{lastStreamActivity=Date.now();clearTimeout(heartbeat);heartbeat=setTimeout(()=>{diagnostic('client.connection',{state:'heartbeat_timeout'});controller.abort()},45000)};
  alive();
  try{
   const response=await fetch('/api/sync/events',{headers:requestHeaders(),signal:controller.signal});
   if(!valid())continue;
   if(response.status===401){expireSession();break}
   if(!response.ok||!response.body)throw new Error('Соединение недоступно');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
   for(;;){const {value,done}=await reader.read();if(!valid()){await reader.cancel();break}if(done)throw new Error('Соединение закрыто');alive();buffer+=decoder.decode(value,{stream:true});let split;
    while((split=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,split);buffer=buffer.slice(split+2);const raw=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(raw){try{void onEvent(JSON.parse(raw)).catch(syncFailure)}catch{}}}
   }
  }catch{if(!state.user)break;if(valid()){diagnostic('client.connection',{state:controller.signal.aborted?'aborted':'disconnected'});emit({connection:'offline'});await reconnectDelay(controller.signal)}}finally{clearTimeout(heartbeat!)}
 }
 reconnecting=false;
}
export async function retryConnection(){
 if(!state.user)return;
 if(state.connection!=='online'){abort?.abort();void connect()}
 const valid=accountScope();
 const results=await Promise.allSettled([refreshModels(),reconcile()]);
 if(valid()&&results[1].status==='fulfilled')void runQueue();
}
async function refreshPending(){
 if(pollBusy)return;pollBusy=true;
 try{
 const valid=accountScope();
 const ids=new Set([...Object.keys(state.lives),...state.queues.filter(q=>!q.failed).map(q=>q.chatId)]);
 const results=await Promise.allSettled([...ids].map(id=>loadChat(id)));
 if(valid()&&results.every(result=>result.status==='fulfilled'))void runQueue();
 }finally{pollBusy=false}
}
export async function init(){
 if(initialized)return;initialized=true;
 window.chatApp={showToast:(message:string,type?:string)=>{if(type==='error'){settingsError=message;failure(message)}else notify(message)}};
 try{const auth=await storage.checkAuth();const chats:Chat[]=storage.getChats();let savedActive=storage.activeChatId;try{if(auth.ok)savedActive=sessionStorage.getItem('llm-active-chat-'+auth.user.id)||savedActive}catch{}const active=chats.some(c=>c.id===savedActive)?savedActive:'new';storage.setActiveChatId(active);emit({ready:true,user:auth.ok?auth.user:null,settings:storage.getSettings(),chats,active,draftModel:storage.getSettings().model});
  if(auth.ok){try{const saved=JSON.parse(sessionStorage.getItem(accountKey('llm-react-queue'))||'[]');emit({queues:Array.isArray(saved)?saved:[]})}catch{}void connect();void refreshModels();}
 }catch(e){emit({ready:true});failure(e)}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenSince=Date.now();return}const pausedMs=hiddenSince?Date.now()-hiddenSince:0;hiddenSince=0;if(!state.user)return;if(pausedMs>4000){if(Date.now()-lastStreamActivity>4000){abort?.abort();void connect()}if(state.active!=='new'&&state.chats.some(c=>c.id===state.active))void loadChat(state.active).catch(syncFailure)}void retryConnection().catch(failure)});
 window.addEventListener('pageshow',event=>{if((event as PageTransitionEvent).persisted&&state.user){abort?.abort();void connect();void retryConnection().catch(failure)}});
  window.addEventListener('online',()=>{if(state.user)void retryConnection().catch(failure)});
  window.addEventListener('pagehide',()=>{const id=state.chats.find(item=>temporaryId(item.id))?.id;if(id){void fetch(`/api/temporary-chats/${encodeURIComponent(id)}/close`,{method:'POST',headers:requestHeaders(),keepalive:true}).catch(()=>{});void endTemporaryChat(false)}});
 setInterval(()=>{if(state.user&&!document.hidden)void refreshPending()},12000);
}
export async function signIn(username:string,password:string,register=false){cancelChatNavigation();const data=await storage[register?'register':'login'](username,password);if(!data.ok)throw new Error(data.error);abort?.abort();emit({user:data.user,chats:storage.getChats(),settings:storage.getSettings(),active:'new',draftModel:storage.getSettings().model,draftOverrides:{},models:[],lives:{},queues:[],error:'',toast:'',connection:'connecting',inference:'unknown',searchTarget:undefined,undoChat:undefined});void connect();void refreshModels()}
export async function logout(){cancelChatNavigation();await endTemporaryChat();const previous=state,queueKey=accountKey('llm-react-queue');emit({ready:false,user:null,queues:[],lives:{},chats:[],models:[],draftOverrides:{},error:'',toast:'',searchTarget:undefined,undoChat:undefined});abort?.abort();try{await storage.settingsWrite;await storage.logout();sessionStorage.removeItem(queueKey);emit({ready:true,settings:storage.getSettings(),active:'new',draftModel:storage.getSettings().model})}catch{emit({...previous,ready:true,error:'Не удалось выйти: сервер недоступен. Попробуйте ещё раз.'});void connect()}}
export function newChat(){cancelChatNavigation();void endTemporaryChat();searchRequest++;storage.setActiveChatId('new');emit({active:'new',searchTarget:undefined,draftModel:state.settings.model,draftOverrides:{},error:''})}
export function startPreset(preset:PresetSnapshot){cancelChatNavigation();void endTemporaryChat();storage.setActiveChatId('new');emit({active:'new',draftModel:preset.model_id,draftOverrides:presetOverrides(preset),error:''})}
/** A requested destination is separate from the complete view the user reads. */
export function cancelChatNavigation(){navigationRevision++;searchRequest++;navigationRetry=undefined;if(state.navigation)emit({navigation:undefined})}
async function navigateChat(id:string,options:NavigationOptions={}):Promise<boolean>{
 const ticket=++navigationRevision,searchTicket=++searchRequest,account=accountScope();
 const valid=()=>account()&&navigationRevision===ticket&&searchRequest===searchTicket;
 navigationRetry=undefined;
 const presentation=():Partial<State>=>({active:id,error:'',navigation:undefined,searchTarget:options.messageId?{chatId:id,messageId:options.messageId,query:options.query||'',nonce:Date.now()}:undefined});
 const cached=state.chats.find(item=>item.id===id);
 const branchReady=!options.branchId||(cached?.active_branch_id||'main')===options.branchId;
 const messageReady=!options.messageId||cached?.messages.some(message=>message.id===options.messageId);
 if(cached&&Array.isArray(cached.messages)&&(cached.messages.length>0||!!state.lives[id])&&branchReady&&messageReady){
  storage.setActiveChatId(temporaryId(id)?'new':id);emit(presentation());
  // Close a temporary source only after the next view has been admitted.
  if(!temporaryId(id))void endTemporaryChat();
  void loadChat(id).catch(error=>{if(valid()&&state.active===id)syncFailure(error)});
  return true;
 }
 emit({navigation:{id:ticket,chatId:id,status:'loading'}});
 try{
  let snapshot=await readChatSnapshot(id);
  if(!valid())return false;
  if(!snapshot)throw new Error('Не удалось открыть диалог. Повторите попытку.');
  if(options.branchId&&(snapshot.chat.active_branch_id||'main')!==options.branchId){
   await api(`/api/chats/${encodeURIComponent(id)}/branch`,'PATCH',{branch_id:options.branchId,expected_branch_id:snapshot.chat.active_branch_id||'main'});
   if(!valid())return false;
   chatRevision[id]=(chatRevision[id]||0)+1;
   // Fetch status and the selected branch together, so a branch cannot be
   // paired with a snapshot from the previously selected branch.
   snapshot=await readChatSnapshot(id);
   if(!valid())return false;
   if(!snapshot||snapshot.chat.active_branch_id!==options.branchId)throw new Error('Не удалось подтвердить выбранную ветку. Повторите попытку.');
  }
  // A newer background read may have superseded this request while it was
  // waiting. Read a fresh coherent snapshot rather than publish an old one.
  for(let attempt=0;attempt<3;attempt++){
   if(!valid())return false;
   if(snapshot&&publishChatSnapshot(snapshot,presentation())){
    storage.setActiveChatId(temporaryId(id)?'new':id);
    if(!temporaryId(id))void endTemporaryChat();
    return true;
   }
   snapshot=await readChatSnapshot(id);
  }
  throw new Error('Диалог обновляется. Повторите открытие.');
 }catch(error){
  if(valid()&&!(error instanceof AccountChanged)){
   // Preserve the original branch/search intent for a scoped retry. This
   // descriptor never leaves memory or outlives its account/request identity.
   navigationRetry={chatId:id,options:{...options},ticket,valid};
   emit({navigation:{id:ticket,chatId:id,status:'error',error:error instanceof Error?error.message:String(error)}});
  }
  return false;
 }
}
export function selectChat(id:string):Promise<boolean>{return navigateChat(id)}
export function retryChatNavigation():Promise<boolean>{
 const retry=navigationRetry;
 if(!retry||!retry.valid()||state.navigation?.status!=='error'||state.navigation.id!==retry.ticket){navigationRetry=undefined;return Promise.resolve(false)}
 return navigateChat(retry.chatId,retry.options);
}
export async function startTemporaryChat(){
 cancelChatNavigation();
 if(state.temporaryStarting||currentChat()?.temporary)return;
 const valid=accountScope(),ticket=++temporaryRevision,model=activeModel();emit({temporaryStarting:true,error:''});
 try{await temporaryClosing;if(!valid()||ticket!==temporaryRevision)return;const data=await api('/api/temporary-chats','POST',{model});if(!valid()||ticket!==temporaryRevision){void api(`/api/temporary-chats/${encodeURIComponent(data.chat.id)}/close`,'POST').catch(()=>{});return}applyChat(data.chat);emit({active:data.chat.id,draftOverrides:{},searchTarget:undefined});window.dispatchEvent(new Event('focus-composer'))}
 finally{emit({temporaryStarting:false})}
}
export function endTemporaryChat(remote=true):Promise<unknown>{
 temporaryRevision++;
 const items=state.chats.filter(item=>temporaryId(item.id));
 if(!items.length)return temporaryClosing;
 const ids=new Set(items.map(item=>item.id)),lives={...state.lives};
 for(const id of ids){closedTemporaryChats.add(id);chatRevision[id]=(chatRevision[id]||0)+1;streamRevision[id]=(streamRevision[id]||0)+1;loadRevision[id]=(loadRevision[id]||0)+1;delete lives[id];delete pendingOverrides[id]}
 const closing=remote?items.map(item=>api(`/api/temporary-chats/${encodeURIComponent(item.id)}/close`,'POST',undefined,45000).catch(()=>{})):[];
 emit({chats:state.chats.filter(item=>!ids.has(item.id)),queues:state.queues.filter(item=>!ids.has(item.chatId)),lives,...(ids.has(state.active)?{active:'new',draftOverrides:{},error:'',searchTarget:undefined}:{})});queuesSave();
 temporaryClosing=Promise.allSettled(closing);return temporaryClosing;
}
export const refreshModels=coalescedRefresh(async current=>{
 try{const payload=inferencePayload().settings;const [models,health,subscription,studio,web]=await Promise.all([api('/api/inference/probe','POST',{...payload,kind:'models'}),api('/api/inference/probe','POST',{...payload,kind:'health'}),api('/api/providers/google-subscription').catch(()=>({models:[]})),api('/api/providers/aistudio').catch(()=>({models:[]})),api('/api/providers/gemini-web').catch(()=>({models:[]}))]);
  if(!current())return 'offline' as const;
  const status=health.loading?'loading':health.ok?'reachable':'offline';
  emit({models:shareSnapshot(state.models,[...(models.raw?.data||[]),...(subscription.models||[]),...(studio.models||[]),...(studio.image_models||[]),...(web.models||[])]),inference:status});
  return status;
 }catch{if(current())emit({inference:'offline'});return 'offline' as const}
});
export async function selectModel(id:string){const scope=state.active,value=withoutPreset(overrides()),actor=!!overrides().workspacePreset;if(scope==='new'){emit({draftModel:id,...(actor?{draftOverrides:value}:{})});return}await metadata(scope,{model_id:id});if(actor)await saveOverrides(value,scope)}
export async function selectPreset(preset:PresetSnapshot){const scope=state.active,value={...withoutPreset(overrides()),...presetOverrides(preset)};if(scope==='new'){emit({draftModel:preset.model_id,draftOverrides:value});return}await metadata(scope,{model_id:preset.model_id});await saveOverrides(value,scope)}
export async function metadata(id:string,values:Values){chatRevision[id]=(chatRevision[id]||0)+1;const result=await api(`/api/chats/${encodeURIComponent(id)}/metadata`,'PATCH',{...values,source_tab:storage.tabId});chatRevision[id]=(chatRevision[id]||0)+1;const chat=state.chats.find(c=>c.id===id);if(chat)applyChat({...chat,...values,title_source:result.title_source??chat.title_source,title_version:result.title_version??chat.title_version,updatedAt:result.updated_at})}
export async function generateTitle(id:string){const item=state.chats.find(c=>c.id===id);if(!item)return;const {model,settings}=inferencePayload(id,item.model_id,item.overrides||{});await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/title`,'POST',{model,settings});notify('Название обновлено')}
export async function saveOverrides(value:Values,id=state.active){
 const valid=accountScope();
 if(id==='new'){emit({draftOverrides:value});return}
 pendingOverrides[id]=value;
 const chat=state.chats.find(c=>c.id===id);if(chat)applyChat({...chat,overrides:value});
 const write=(overrideWrites[id]||Promise.resolve()).catch(()=>{}).then(()=>{if(!valid())throw new AccountChanged();return api(`/api/chats/${encodeURIComponent(id)}/overrides`,'PUT',{overrides:value,source_tab:storage.tabId})});
 overrideWrites[id]=write;
 try{await write}finally{if(overrideWrites[id]===write){delete pendingOverrides[id];delete overrideWrites[id];if(valid())await loadChat(id)}}
}
export async function saveSettings(values:Values){settingsError='';storage.saveSettings(values);emit({settings:storage.getSettings()});await storage.settingsWrite;if(settingsError)throw new Error(settingsError)}
export async function saveModelMemory(model:string,enabled:boolean){
 const valid=accountScope();
 await storage.settingsWrite;
 if(!valid())throw new AccountChanged();
 const patch={model_configs:{[model]:{memoryEnabled:enabled}},source_tab:storage.tabId};
 await api('/api/settings','POST',patch);
 storage.applyRemoteSettings(patch);
 emit({settings:storage.getSettings()});
}
export async function saveReasoning(model:string,patch:Values){
  const scope=state.active,over=overrides();
  if(temporaryId(scope)){await saveOverrides({...over,[model]:{...over[model],...patch}},scope);return}
 const remembered=saveSettings({modelConfigs:{...state.settings.modelConfigs,[model]:{...state.settings.modelConfigs?.[model],...patch}}});
 const current=saveOverrides({...over,[model]:{...over[model],...patch}},scope);
 await Promise.all([remembered,current]);
}
export async function saveProfile(model:string,profile:Values,config:Values){settingsError='';storage.saveModelProfile(model,profile);storage.saveModelConfig(model,config);emit({settings:storage.getSettings()});await storage.settingsWrite;if(settingsError)throw new Error(settingsError);notify('Профиль модели сохранён')}
export async function updateAccount(name:string,avatar:string){const valid=accountScope();const user=await storage.updateProfile(undefined,avatar,name);if(!valid())throw new AccountChanged();emit({user});notify('Профиль обновлён')}
export async function transmit(item:QueueItem){
 const accountValid=accountScope(),valid=()=>accountValid()&&!closedTemporaryChats.has(item.chatId);
 const id=item.chatId;if(!state.chats.find(c=>c.id===id)?.messages.some(m=>m.id===item.id))markMessageSent(item.id);
 // A history/status request already in flight was taken before this send.
 // Without new revisions its idle reply wiped the optimistic question and the
 // live row until stream_end (iPhone recording 08.11.2026). Runs synchronously
 // right after send() appends the question, and for queued sends too.
 chatRevision[id]=(chatRevision[id]||0)+1;streamRevision[id]=(streamRevision[id]||0)+1;
 emit({lives:{...state.lives,[id]:{chat_id:id,model:item.payload.model,phase:'Обработка запроса…'}},error:''});
 try{await api('/api/chat/generate','POST',{...item.payload,...clockContext(),message:item.content,message_id:item.id,attachments:item.attachments});if(valid())await loadChat(id)}
 catch(e){if(!valid())return;diagnostic('client.recovery',{state:'send_ack_missing'});let recovered=false;try{await loadChat(id);recovered=true}catch{}
  if(!valid())return;
  const recoveredChat=state.chats.find(c=>c.id===id),messages=recoveredChat?.messages||[],index=messages.findIndex(m=>m.id===item.id);
  const matchingBranch=!item.payload.expected_branch_id||(recoveredChat?.active_branch_id||'main')===item.payload.expected_branch_id;
  if(recovered&&matchingBranch&&index>=0&&(state.lives[id]||messages.slice(index+1).some(m=>m.role==='assistant'))){diagnostic('client.recovery',{state:'send_recovered'});return;}
  if(!recovered){const lives={...state.lives};delete lives[id];emit({lives})}throw e
 }
}
export async function sendSuggestion(messageId:string,text:string){
 const last=currentChat()?.messages.at(-1);
 if(state.settings.chatSuggestions===false||state.lives[state.active]||last?.role!=='assistant'||last.id!==messageId||!last.suggestions?.includes(text))return false;
 window.dispatchEvent?.(new Event('suggestion-sent'));
 return send(text,[],'suggestion');
}
export async function send(content:string,attachments:Attachment[],origin:SentOrigin='composer'){
 if(state.navigation?.status==='loading')throw new Error('Дождитесь открытия выбранного диалога.');
 const valid=accountScope();
 if(!content.trim()&&!attachments.length)return false;
 const model=activeModel();
 const id=state.active==='new'?`chat_${crypto.randomUUID?.()||Date.now()+'_'+Math.random()}`:state.active;
 const item:QueueItem={id:`user_${Date.now()}_${Math.random().toString(36).slice(2)}`,chatId:id,content,attachments,payload:inferencePayload(id,model)};
 if(state.lives[id]){emit({queues:[...state.queues,item]});diagnostic('client.queue',{state:'queued',count:state.queues.length});queuesSave();return true}
 const existing=currentChat();const chat:Chat=existing?{...existing,messages:[...existing.messages,{id:item.id,role:'user',content,attachments,timestamp:Date.now()}]}:{id,title:content.slice(0,42)||attachments[0]?.name||'Вложение',model_id:model,messages:[{id:item.id,role:'user',content,attachments,timestamp:Date.now()}],overrides:state.draftOverrides,createdAt:Date.now(),updatedAt:Date.now()};
 markMessageSent(item.id,origin);applyChat(chat);storage.setActiveChatId(temporaryId(id)?'new':id);emit({active:id});
 try{await transmit(item)}catch(e){if(valid()&&!closedTemporaryChats.has(id)){emit({queues:[...state.queues,{...item,failed:e instanceof Error?e.message:String(e)}]});queuesSave();failure(e)}}return true;
}
export async function stop(){const id=state.active;if(!state.lives[id])return;emit({lives:{...state.lives,[id]:{...state.lives[id],stopping:true}}});try{await api('/api/chat/stop','POST',{chat_id:id});await loadChat(id)}catch(e){failure(e);if(state.lives[id])emit({lives:{...state.lives,[id]:{...state.lives[id],stopping:false}}})}}
export async function editMessage(message:Message,text:string){const id=state.active;await mutateChat(id,'/api/chat/edit','POST',{...inferencePayload(),message_id:message.id,new_content:text});await loadChat(id)}
export async function forkBranch(messageId?:string){const id=state.active;if(id==='new')return;await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/branches`,'POST',{message_id:messageId,expected_branch_id:currentChat()?.active_branch_id||'main'});notify('Новая ветка создана. Прежнее продолжение сохранено')}
export async function selectBranch(branchId:string){const id=state.active;if(id==='new')return false;return navigateChat(id,{branchId})}
function requireEditableChat(){const id=state.active;if(id==='new')throw new Error('Диалог ещё не создан');if(state.lives[id]||state.queues.some(q=>q.chatId===id&&!q.failed))throw new Error('Дождитесь завершения ответов и очереди');return id}
export async function deleteMessage(messageId:string){const id=requireEditableChat();await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,'DELETE',{expected_branch_id:currentChat()?.active_branch_id||'main'});notify('Сообщение удалено')}
export async function deleteBranch(branchId:string){const id=requireEditableChat();await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/branches/${encodeURIComponent(branchId)}`,'DELETE',{expected_branch_id:currentChat()?.active_branch_id||'main'});notify('Ветка удалена')}
export async function regenerate(message:Message){
 const id=state.active;
 window.dispatchEvent?.(new CustomEvent('chat-regeneration-start',{detail:{chatId:id,messageId:message.id}}));
 try{await api('/api/chat/regenerate','POST',{...inferencePayload(),message_id:message.id});await loadChat(id)}
 finally{window.dispatchEvent?.(new CustomEvent('chat-regeneration-settled',{detail:{chatId:id,messageId:message.id,generating:!!state.lives[id]}}))}
}
export async function chooseVariant(message:Message,index:number){const id=state.active;await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/variant`,'PATCH',{message_id:message.id,index,expected_branch_id:currentChat()?.active_branch_id||'main'})}
export async function deleteChat(id:string){if(temporaryId(id)){await endTemporaryChat();notify('Временный чат завершён');return}const item=state.chats.find(c=>c.id===id);await api(`/api/chats/${encodeURIComponent(id)}`,'DELETE');forgetChat(id);notify('Диалог перемещён в корзину');emit({undoChat:{id,title:item?.title||'Диалог'}});clearTimeout(toastTimer);toastTimer=setTimeout(()=>emit({toast:'',undoChat:undefined}),8000);window.dispatchEvent(new Event('chat-trash-updated'))}
export async function restoreChat(id:string){const result=await mutateChat(id,`/api/chats/${encodeURIComponent(id)}/restore`,'POST',{});notify('Диалог восстановлен');window.dispatchEvent(new Event('chat-trash-updated'));return result.chat}
export function clearSearchTarget(){cancelChatNavigation();emit({searchTarget:undefined})}
export function openSearchResult(result:import('./chatSearch').SearchResult,query:string):Promise<boolean>{return navigateChat(result.chat_id,{branchId:result.branch_id,messageId:result.message_id||undefined,query})}
export function clearError(){emit({error:''})}
export async function exportData(){try{const backup=JSON.parse(storage.exportData());const data=await api('/api/chats/export');backup.chats=data.chats;backup.version=3;download(JSON.stringify(backup,null,2),'llm-chat-backup.json','application/json')}catch(error){failure(error)}}
export async function importData(text:string){JSON.parse(text);if(!await storage.importData(text))throw new Error('Не удалось импортировать файл');await reconcile();notify('Данные импортированы')}
export function download(text:string,name:string,type='text/markdown'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function exportChat(){const chat=currentChat();if(chat)download(`# ${chat.title}\n\n${chat.messages.map(m=>`## ${m.role==='user'?'Вы':m.model||'Модель'}\n\n${m.content}`).join('\n\n')}`,'conversation.md')}
