import {createContext,useContext,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {diagnostic} from '../diagnostics';
import {EMPTY_MEDIA,nanoMediaCache} from './nanoMedia';
import {RefreshCw} from '../icons';
import {IconButton} from './primitives';
import type {NanoPart} from './nanoTypes';
const imageMounts=new WeakMap<HTMLImageElement,number>();
export function nanoMediaElement(node:HTMLImageElement|null){if(node)imageMounts.set(node,performance.now())}
export function nanoMediaReady(event:{currentTarget:HTMLImageElement}){const node=event.currentTarget,start=imageMounts.get(node);if(start!==undefined){imageMounts.delete(node);diagnostic('client.media',{state:'displayed',duration_ms:performance.now()-start,width:node.naturalWidth,height:node.naturalHeight})}}
export const NanoMediaAccount=createContext('');
export type MediaPart=Extract<NanoPart,{type:'image'|'video'}>;
export function nanoMediaPath(part:MediaPart,preview=false,size=320){const path=part.kind==='nano_video'?`/api/images/nano/videos/${encodeURIComponent(part.id)}/${part.index}`:part.kind==='nano_asset'?`/api/images/nano/uploads/${encodeURIComponent(part.id)}`:`/api/images/${encodeURIComponent(part.id)}/image/${part.index}`;return path+(preview&&part.type==='image'?`?preview=true&v=2${size!==320?'&preview_size='+size:''}`:'')}
export function useNanoMedia(part?:MediaPart,preview=false,enabled=true,size=320){
 const account=useContext(NanoMediaAccount),path=part?nanoMediaPath(part,preview,size):'';
 const snapshot=useSyncExternalStore(listener=>path&&enabled?nanoMediaCache.subscribe(account,path,listener):()=>{},()=>path&&enabled?nanoMediaCache.snapshot(account,path):EMPTY_MEDIA,()=>EMPTY_MEDIA);
 useEffect(()=>{if(!path||!enabled)return;const start=performance.now();const release=nanoMediaCache.retain(account,path,window.storageManager.getAuthHeaders());let recorded=false;const finish=()=>{const result=nanoMediaCache.snapshot(account,path);if(!recorded&&(result.url||result.failed)){recorded=true;diagnostic('client.media',{duration_ms:performance.now()-start,state:result.failed?'error':preview?'preview':'original'})}};finish();const unsubscribe=nanoMediaCache.subscribe(account,path,finish);return()=>{unsubscribe();release()}},[account,path,enabled,preview]);
 return {...snapshot,fail:()=>{if(path)nanoMediaCache.fail(account,path)},retry:()=>{if(path)nanoMediaCache.retry(account,path,window.storageManager.getAuthHeaders())}};
}
export function useNearMedia<T extends HTMLElement=HTMLDivElement>(){const host=useRef<T>(null),[near,setNear]=useState(false);useEffect(()=>{if(!host.current)return;if(!('IntersectionObserver' in window)){setNear(true);return}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect()}},{rootMargin:'240px'});observer.observe(host.current);return()=>observer.disconnect()},[]);return {host,near}}
export function NanoPreview({part,alt='',className='',interactive=true}:{part:MediaPart;alt?:string;className?:string;interactive?:boolean}){const {host,near}=useNearMedia(),{url,failed,retry,fail}=useNanoMedia(part,true,near);return <div ref={host} className={`nano-preview ${className}`} data-failed={failed||undefined}>{url?<img key={url} ref={nanoMediaElement} onLoad={nanoMediaReady} src={url} alt={alt} draggable={false} onError={fail}/>:failed&&interactive?<IconButton label="Повторить загрузку миниатюры" onClick={e=>{e.stopPropagation();retry()}}><RefreshCw size={18}/></IconButton>:<span className="nano-thumb-loading" aria-hidden="true"/>}</div>}
