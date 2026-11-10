import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../store';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {imageStudioRequestId} from './useImageStudioDraft';
import {imageEditPending,latestImageEditParent,type ImageEditView,type ImageEditMessage} from './imageEditTypes';
import type {StudioJob} from './studioTypes';
class EditRequestError extends Error{constructor(message:string,readonly status:number){super(message)}}
async function sendMessage(path:string,payload:object){
 const response=await fetch(path,{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
 if(!response.ok)throw new EditRequestError(typeof result.detail==='string'?result.detail:'Не удалось отправить изменения.',response.status);
 return result as {job:StudioJob;message:ImageEditMessage};
}

export function useImageEditSession(source:StudioJob,userId:string,onJob:(job:StudioJob)=>void){
 const [view,setView]=useSnapshotState<ImageEditView|null>(null),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[parentId,setParentId]=useState<string|null>(null),[tailId,setTailId]=useState<string|null>(null),[accepted,setAccepted]=useState(0);
 const epoch=useRef(0),current=useRef<ImageEditView|null>(null),parent=useRef<string|null>(null),reported=useRef(new Set<string>()),onJobRef=useRef(onJob),working=useRef(false),request=useRef<{id:string;signature:string;prompt:string;parent:string|null;ratio:string;size:string}|null>(null),refreshRef=useRef<()=>Promise<void>>(async()=>{});
 onJobRef.current=onJob;
 const apply=useCallback((next:ImageEditView,initial=false)=>{
  const previous=current.current;current.current=next;setView(next);
  const priorIds=new Set(previous?.messages.map(message=>message.id)||[]);
  const completed=next.messages.filter(message=>message.role==='model'&&message.job?.status==='done');
  if(initial){const latest=latestImageEditParent(next);parent.current=latest;setParentId(latest);const failed=[...next.messages].reverse().find(message=>message.role==='user'&&message.parent_id===latest&&message.job&&['error','cancelled'].includes(message.job.status));setTailId(failed?.id??null)}
  else{
   const finished=[...completed].reverse().find(message=>!priorIds.has(message.id));
   if(finished){parent.current=finished.id;setParentId(finished.id);setTailId(null)}
  }
  const pendingUser=[...next.messages].reverse().find(message=>message.role==='user'&&message.parent_id===parent.current&&imageEditPending(message.job));
  if(pendingUser)setTailId(pendingUser.id);
  const queued=request.current;
  if(queued){const acknowledged=next.messages.find(message=>message.role==='user'&&message.job?.request_id===queued.id);if(acknowledged){request.current=null;setUncertain(false);setError('');setAccepted(value=>value+1);if(!next.messages.some(message=>message.role==='model'&&message.parent_id===acknowledged.id))setTailId(acknowledged.id)}}
  for(const message of next.messages){const job=message.job;if(job&&!imageEditPending(job)&&!reported.current.has(job.id)){reported.current.add(job.id);if(job.status==='done'&&job.images?.length)onJobRef.current(job)}}
 },[setView]);
 useEffect(()=>{
  const ticket=++epoch.current;current.current=null;parent.current=null;reported.current=new Set();request.current=null;working.current=false;setView(null);setLoading(true);setSending(false);setUncertain(false);setError('');setParentId(null);setTailId(null);
  let fetching=false;
  const refresh=async()=>{
   if(fetching)return;fetching=true;const initial=!current.current;
   try{const next:ImageEditView=initial?await api('/api/images/edit-sessions','POST',{source_job_id:source.id}):await api(`/api/images/edit-sessions/${encodeURIComponent(current.current!.session.id)}`);if(ticket===epoch.current){apply(next,initial);setLoading(false);if(initial)setError('')}}catch(e){if(ticket===epoch.current){setError(e instanceof Error?e.message:'Не удалось обновить редактирование.');setLoading(false)}}finally{fetching=false}
  };
  refreshRef.current=refresh;
  void refresh();
  const stop=pollVisible(refresh,1200);
  const restored=()=>void refresh();window.addEventListener('project-data-restored',restored);
  return()=>{++epoch.current;stop();window.removeEventListener('project-data-restored',restored)};
 },[source.id,userId,apply,setView]);
 const send=async(prompt:string,aspectRatio:string,imageSize='1K',retry=false)=>{
  const snapshot=current.current;if(!snapshot||working.current||imageEditPending(snapshot.active_job)||!prompt.trim())return false;
  const ticket=epoch.current,payload=retry&&request.current?{parent_id:request.current.parent,prompt:request.current.prompt,aspect_ratio:request.current.ratio,image_size:request.current.size}:{parent_id:parent.current,prompt:prompt.trim(),aspect_ratio:aspectRatio,image_size:imageSize},signature=JSON.stringify({session:snapshot.session.id,...payload});
  if(request.current&&request.current.signature!==signature){setError('Статус предыдущей отправки ещё не подтверждён. Повтори её или дождись восстановления связи.');return false}
  if(!request.current)request.current={id:imageStudioRequestId(),signature,prompt:payload.prompt,parent:payload.parent_id,ratio:payload.aspect_ratio,size:payload.image_size};
  const requestId=request.current.id;working.current=true;setSending(true);setError('');
  try{
   const result=await sendMessage(`/api/images/edit-sessions/${encodeURIComponent(snapshot.session.id)}/messages`,{...payload,request_id:requestId});
   if(ticket!==epoch.current)return false;
   request.current=null;setUncertain(false);setAccepted(value=>value+1);setTailId(result.message.id);
   const latest=current.current||snapshot;
   apply({...latest,messages:[...latest.messages.filter(message=>message.id!==result.message.id),result.message],active_job:imageEditPending(result.job)?result.job:null});
   void refreshRef.current();return true;
  }catch(e){if(ticket!==epoch.current)return false;if(!request.current)return true;if(e instanceof EditRequestError&&e.status<500){request.current=null;setUncertain(false)}else setUncertain(true);setError(e instanceof EditRequestError?e.message:'Не удалось подтвердить отправку. Можно безопасно повторить её.');return false}
  finally{if(ticket===epoch.current){working.current=false;setSending(false)}}
 };
 const branch=(messageId:string|null)=>{if(working.current||request.current||imageEditPending(current.current?.active_job))return;parent.current=messageId;setParentId(messageId);setTailId(null);setError('')};
 const stop=async()=>{const job=current.current?.active_job;if(!job)return;try{await api(`/api/images/${encodeURIComponent(job.id)}/stop`,'POST');await refreshRef.current()}catch(e){setError(e instanceof Error?e.message:'Не удалось остановить редактирование.')}};
 const restart=async(jobId:string)=>{if(working.current||request.current||imageEditPending(current.current?.active_job))return;const ticket=epoch.current;working.current=true;setSending(true);setError('');try{const next:ImageEditView=await api('/api/images/edit-sessions','POST',{source_job_id:jobId,fresh:true});if(ticket===epoch.current){reported.current=new Set();apply(next,true);setAccepted(value=>value+1)}}catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:'Не удалось начать новую цепочку.')}finally{if(ticket===epoch.current){working.current=false;setSending(false)}}};
 return {view,loading,sending,uncertain,error,parentId,tailId,accepted,send,branch,stop,restart,retry:()=>request.current?send(request.current.prompt,request.current.ratio,request.current.size,true):Promise.resolve(false),refresh:()=>refreshRef.current()};
}
