import {createContext,useContext,useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowUpRight,ImageOff,RefreshCw} from '../icons';
import {safeUrl} from '../domain';
import {requestHeaders} from '../store';
import {ArtViewer} from './ArtViewer';
import {fitArtRect} from './artViewerGeometry';
import {IconButton} from './primitives';
import type {WebImage} from '../types';
import {webImagePath} from '../webImages';
import './WebImage.css';

export const WebImagesContext=createContext<readonly WebImage[]|undefined>(undefined);

function SavedWebImage({item}:{item:WebImage}){
 const frame=useRef<HTMLSpanElement>(null),button=useRef<HTMLButtonElement>(null);
 const [requested,setRequested]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(false);
 const path=webImagePath(item),owner=typeof window==='undefined'?undefined:window.storageManager?.currentUser?.id;
 useEffect(()=>{
  const element=frame.current;if(!element)return;
  if(typeof IntersectionObserver==='undefined'){setRequested(true);return}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setRequested(true);observer.disconnect()}},{root:element.closest('.message-scroll'),rootMargin:'600px 0px'});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!requested)return;
  let alive=true,objectUrl='';const controller=new AbortController();setError(false);setUrl('');
  void fetch(path,{headers:requestHeaders(),signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('unavailable');
   const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type))throw Error('unsupported');
   if(!alive)return;
   objectUrl=URL.createObjectURL(blob);
   const image=new Image();image.src=objectUrl;await image.decode();
   if(alive&&owner===window.storageManager?.currentUser?.id)setUrl(objectUrl);
  }).catch(()=>{if(alive&&!controller.signal.aborted)setError(true)});
  return()=>{alive=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[path,requested,attempt,owner]);
 const style={'--web-image-width':`${Math.min(item.width,680)}px`,'--web-image-ratio':`${item.width}/${item.height}`} as CSSProperties;
 const origin=()=>{const rect=button.current?.getBoundingClientRect();return rect?fitArtRect({x:rect.x,y:rect.y,width:rect.width,height:rect.height},item.width/item.height):null};
 return <span ref={frame} className="web-illustration" style={style} data-web-image-id={item.id}>
  <span className="web-illustration-frame">
   {url?<button ref={button} type="button" className="web-illustration-open" aria-label="Увеличить иллюстрацию" onClick={()=>setOpen(true)}><img src={url} alt={item.caption} width={item.width} height={item.height} decoding="async" draggable={false}/></button>:<span className="web-illustration-placeholder" role="status">{error?<><ImageOff size={20}/><span>Иллюстрация недоступна</span><IconButton label="Повторить загрузку иллюстрации" onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={16}/></IconButton></>:requested?'Загружаю иллюстрацию…':'Иллюстрация'}</span>}
  </span>
  <span className="web-illustration-caption">{item.caption} <a href={safeUrl(item.source_url)} target="_blank" rel="noopener noreferrer">Источник <ArrowUpRight size={12}/></a></span>
  {url&&<ArtViewer open={open} onOpenChange={setOpen} frame={{job:{id:item.id,prompt:item.caption,width:item.width,height:item.height},url}} downloadLabel={'\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u0438\u043b\u043b\u044e\u0441\u0442\u0440\u0430\u0446\u0438\u044e'} downloadExtension={item.content_type==='image/jpeg'?'jpg':item.content_type==='image/webp'?'webp':'png'} previous={null} getSourceRect={origin} restoreFocus={()=>button.current?.focus({preventScroll:true})} title="Просмотр иллюстрации" closeLabel="Закрыть просмотр иллюстрации"/>}
 </span>;
}

export function MarkdownImage({src,alt}:{src?:string;alt?:string}){
 const images=useContext(WebImagesContext),item=images?.find(item=>webImagePath(item)===src);
 return item?<SavedWebImage item={item}/>:<a href={safeUrl(src||'')} target="_blank" rel="noopener noreferrer">{alt||'Изображение'} <ArrowUpRight size={12}/></a>;
}
