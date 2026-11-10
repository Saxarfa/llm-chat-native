import {getState} from '../store';
import {diagnostic,clientError} from '../diagnostics';

export async function downloadSelectedArts(ids:string[],signal:AbortSignal){
 const user=getState().user?.id,started=performance.now();
 diagnostic('client.lifecycle',{source:'image_export',state:'started',count:ids.length});
 try{
  const response=await fetch('/api/images/history/download',{method:'POST',headers:window.storageManager.getAuthHeaders(),body:JSON.stringify({ids}),signal:AbortSignal.any([signal,AbortSignal.timeout(210000)])});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(typeof data.detail==='string'?data.detail:'Не удалось скачать архив артов.')}
  const blob=await response.blob();
  if(signal.aborted||getState().user?.id!==user)throw new DOMException('Cancelled','AbortError');
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='LLM-Chat-arts.zip';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  diagnostic('client.lifecycle',{source:'image_export',state:'completed',count:ids.length,duration_ms:performance.now()-started});
 }catch(error){diagnostic('client.lifecycle',{source:'image_export',state:'failed',...clientError(error)});throw error}
}
