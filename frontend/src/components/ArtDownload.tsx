import {HintLink} from './Hint';
import {useEffect,useState} from 'react';
import {Download} from '../icons';
import {triggerHaptic} from '../haptics';

function isIOSDevice(){
 return typeof navigator!=='undefined'&&(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
}

export function ArtDownload({url,name='Art',className='',size=17,imageId,label='Скачать арт',extension='png'}:{url:string;imageId?:string;name?:string;className?:string;size?:number;label?:string;extension?:string}){
 const ios=isIOSDevice();
 const [ready,setReady]=useState<{url:string;file:File}|null>(null);
 const filename=`${name.replace(/[^\w.-]/g,'_')}.${extension}`;
 const downloadUrl=imageId?`/api/images/${encodeURIComponent(imageId)}/image/0`:url;
 useEffect(()=>{
  if(!ios||!navigator.share)return;let alive=true;const controller=new AbortController();
  void fetch(downloadUrl,{signal:controller.signal,headers:imageId?window.storageManager?.getAuthHeaders?.():undefined}).then(response=>{if(!response.ok)throw Error('Не удалось загрузить оригинал');return response.blob()}).then(blob=>{
   const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
   if(alive)setReady({url,file:new File([blob],filename.replace(/\.png$/,'.'+extension),{type:blob.type||'image/png'})});
  }).catch(()=>{});
  return()=>{alive=false;controller.abort()};
 },[url,downloadUrl,filename,ios,imageId]);
 return <HintLink href={downloadUrl} download={filename} className={className} aria-label={label} hint={label} onClick={event=>{
  event.stopPropagation();
  triggerHaptic('light');
  if(!ios||!navigator.share)return;
  if(ready?.url===url&&navigator.canShare?.({files:[ready.file]})){
   event.preventDefault();
   // Call the system sheet directly in the tap gesture, with the file already ready.
   void navigator.share({files:[ready.file]}).catch(error=>{
    if(error?.name==='AbortError')return;
    const link=document.createElement('a');link.href=downloadUrl;link.download=ready.file.name;link.click();
   });
   return;
  }
  event.preventDefault();
  void fetch(downloadUrl,{headers:imageId?window.storageManager?.getAuthHeaders?.():undefined}).then(response=>{if(!response.ok)throw Error('Не удалось загрузить оригинал');return response.blob()}).then(blob=>{
   const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
   const file=new File([blob],filename.replace(/\.png$/,'.'+extension),{type:blob.type||'image/png'});
   setReady({url,file});
   if(navigator.canShare?.({files:[file]}))return navigator.share({files:[file]});
   const link=document.createElement('a');link.href=downloadUrl;link.download=file.name;link.click();
  }).catch(error=>{
   if(error?.name==='AbortError')return;
   const link=document.createElement('a');link.href=downloadUrl;link.download=filename;link.click();
  });
 }}><Download size={size}/></HintLink>;
}

export function VideoDownload({jobId,name,className='',size=16}:{jobId:string;name?:string;className?:string;size?:number}){
 const ios=isIOSDevice();
 const [ready,setReady]=useState<{jobId:string;file:File}|null>(null);
 const filename=`${(name||`Art-${jobId}`).replace(/[^\w.-]/g,'_')}.mp4`;
 const downloadUrl=`/api/videos/${encodeURIComponent(jobId)}/file?download=true`;
 useEffect(()=>{
  if(!ios||!navigator.share)return;let alive=true;const controller=new AbortController();
  void fetch(downloadUrl,{signal:controller.signal,headers:window.storageManager?.getAuthHeaders?.()}).then(response=>{if(!response.ok)throw Error('Не удалось подготовить видео');return response.blob()}).then(blob=>{
   if(alive)setReady({jobId,file:new File([blob],filename,{type:blob.type||'video/mp4'})});
  }).catch(()=>{});
  return()=>{alive=false;controller.abort()};
 },[jobId,downloadUrl,filename,ios]);
 return <a href={downloadUrl} download={filename} className={className||undefined} aria-label="Скачать видео" onClick={event=>{
  event.stopPropagation();
  triggerHaptic('light');
  if(!ios||!navigator.share)return;
  if(ready?.jobId===jobId&&navigator.canShare?.({files:[ready.file]})){
   event.preventDefault();
   void navigator.share({files:[ready.file]}).catch(error=>{
    if(error?.name==='AbortError')return;
    const link=document.createElement('a');link.href=downloadUrl;link.download=ready.file.name;link.click();
   });
   return;
  }
  event.preventDefault();
  void fetch(downloadUrl,{headers:window.storageManager?.getAuthHeaders?.()}).then(response=>{if(!response.ok)throw Error('Не удалось подготовить видео');return response.blob()}).then(blob=>{
   const file=new File([blob],filename,{type:blob.type||'video/mp4'});
   setReady({jobId,file});
   if(navigator.canShare?.({files:[file]}))return navigator.share({files:[file]});
   const link=document.createElement('a');link.href=downloadUrl;link.download=file.name;link.click();
  }).catch(error=>{
   if(error?.name==='AbortError')return;
   const link=document.createElement('a');link.href=downloadUrl;link.download=filename;link.click();
  });
 }}><Download size={size}/></a>;
}
