import {useEffect,useRef,useSyncExternalStore} from 'react';
import * as chat from './store';
export type ChatNote={id:string;text:string;status:'active'|'pending';origin:string;source_quote?:string;replace_id?:string};
export type ContextBlock={id:string;text:string;sources:{id:string;offset:number;length:number}[];anchors:{message_id:string;quote:string;kind:string}[]};
export type ChatContextData={version:number;branch_id:string;auto_compact:boolean;suggest_notes:boolean;notes:ChatNote[];pins:{id:string;text:string;role:string}[];compression:{text:string;created_at:number;model:string;capacity:number;format?:number;blocks?:ContextBlock[];annotation?:string}|null;covered_count:number;message_count:number;used_tokens:number;included_blocks?:number;retrieved_count?:number;busy:boolean};
const cache=new Map<string,ChatContextData>(),pending=new Map<string,Promise<void>>(),listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
const scope=(id:string,branch:string)=>`${chat.getState().user?.id}:${id}:${branch}`;
export async function refreshContext(id:string,branch:string){
 const key=scope(id,branch);if(pending.has(key))return pending.get(key);
 const work=chat.api(`/api/chats/${encodeURIComponent(id)}/context?expected_branch_id=${encodeURIComponent(branch)}`).then(data=>{cache.set(key,data);emit()}).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
export function useChatContext(){
 const selection=chat.useChatSelection(state=>{
  const active=state.chats.find(c=>c.id===state.active),id=active?.id||'';
  return {user:state.user?.id,id,branch:active?.active_branch_id||'main',updatedAt:active?.updatedAt,locked:!!state.lives[id]||state.queues.some(q=>q.chatId===id&&!q.failed)};
 },(a,b)=>a.user===b.user&&a.id===b.id&&a.branch===b.branch&&a.updatedAt===b.updatedAt&&a.locked===b.locked);
 const {id,branch,updatedAt}=selection,key=scope(id,branch),previous=useRef({key,updatedAt});
 const data=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>cache.get(key));
 useEffect(()=>{
  const changed=previous.current.key!==key||previous.current.updatedAt!==updatedAt;previous.current={key,updatedAt};
  if(!id)return;
  // New historical rows subscribe to the shared result, not a fresh request
  // for each mounted pin button. Revalidate when the conversation changes.
  if(!cache.has(key)||changed)void refreshContext(id,branch).catch(()=>{});
  const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!detail?.chat_id||detail.chat_id===id)void refreshContext(id,branch).catch(()=>{})};
  window.addEventListener('chat-context-updated',update);return()=>window.removeEventListener('chat-context-updated',update);
 },[key,id,branch,updatedAt]);
 return {id,branch,data,locked:selection.locked||!!data?.busy};
}
export async function changeContext(id:string,branch:string,action:string,values:Record<string,unknown>={}){
 if(!cache.has(scope(id,branch)))await refreshContext(id,branch);
 const data=await chat.api(`/api/chats/${encodeURIComponent(id)}/context`,'PATCH',{expected_branch_id:branch,version:cache.get(scope(id,branch))!.version,action,...values});cache.set(scope(id,branch),data);emit();return data as ChatContextData;
}
export async function compactContext(id:string,branch:string){
 const request=chat.inferencePayload(id);const result=await chat.api(`/api/chats/${encodeURIComponent(id)}/context/compress`,'POST',{expected_branch_id:branch,model:request.model,settings:request.settings,system_prompt:request.system_prompt},300000);cache.set(scope(id,branch),result);emit();return result as ChatContextData;
}
export function openChatContext(){window.dispatchEvent(new Event('open-chat-context'))}
