import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Clapperboard,Download} from '../icons';
import {Button} from './primitives';
import {NanoMediaAccount,useNanoMedia} from './useNanoMedia';
import {useReducedMotion} from '../useReducedMotion';
import type {GeneratedImage} from '../types';
import './ChatVideo.css';

/** Account-scoped MP4 blobs; native controls never start playback on their own. */
export function ChatVideo({image}:{image:GeneratedImage}){
 const account=String(window.storageManager.currentUser?.id||'');
 return <NanoMediaAccount.Provider value={account}><Video key={account+':'+image.id} image={image}/></NanoMediaAccount.Provider>;
}
function Video({image}:{image:GeneratedImage}){
 const host=useRef<HTMLElement>(null),player=useRef<HTMLVideoElement>(null),position=useRef(0),inView=useRef(false);
 const [near,setNear]=useState(false),reduced=useReducedMotion(),[playbackError,setPlaybackError]=useState(false);
 const ready=image.status==='done'&&(image.video_count||0)>0,busy=['queued','preparing','generating'].includes(image.status);
 const {url,failed,retry}=useNanoMedia({type:'video',kind:'nano_video',id:image.id,index:0},false,near&&ready);
 const remember=(node:HTMLVideoElement)=>{if(node.readyState>0&&Number.isFinite(node.currentTime))position.current=node.currentTime};
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const nearby=new IntersectionObserver(entries=>setNear(entries.some(e=>e.isIntersecting)),{rootMargin:'320px 0px'});
  const visible=new IntersectionObserver(entries=>{inView.current=entries.some(e=>e.isIntersecting);if(!inView.current)player.current?.pause()});
  nearby.observe(element);visible.observe(element);
  return()=>{nearby.disconnect();visible.disconnect()};
 },[]);
 useEffect(()=>{
  const node=player.current;if(!node)return;
  setPlaybackError(false);
  const pause=()=>{remember(node);node.pause()};
  const hidden=()=>{if(document.hidden||node.closest('[hidden],[inert],[aria-hidden="true"]'))pause()};
  const observer=new MutationObserver(hidden);
  for(let parent=node.parentElement;parent;parent=parent.parentElement)observer.observe(parent,{attributes:true,attributeFilter:['hidden','inert','aria-hidden']});
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pause);
  return()=>{pause();observer.disconnect();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pause)};
 },[url]);
 useEffect(()=>{if(reduced)player.current?.pause()},[reduced]);
 const style={'--chat-art-ratio':image.width/image.height,'--chat-art-width':`${image.width}px`} as CSSProperties;
 const label=busy?'Генерация видео…':image.status==='cancelled'?'Генерация остановлена':image.error||'Не удалось создать видео';
 return <div className="chat-video">
  <section ref={host} className="chat-art chat-art-refined" style={style} aria-label="Видео из AI Studio">
   {url?<video ref={player} src={url} controls playsInline preload="metadata" aria-label="Видео Gemini Omni"
    onLoadedMetadata={event=>{const node=event.currentTarget;if(position.current>0&&Number.isFinite(node.duration))node.currentTime=Math.min(position.current,Math.max(0,node.duration-.1))}}
    onTimeUpdate={event=>remember(event.currentTarget)} onPause={event=>remember(event.currentTarget)}
    onPlay={event=>{if(document.hidden||!inView.current||event.currentTarget.closest('[hidden],[inert],[aria-hidden="true"]'))event.currentTarget.pause()}}
    onError={()=>setPlaybackError(true)}/>
    :<div className="chat-art-placeholder" role="status"><Clapperboard size={24}/><span>{failed?'Не удалось загрузить видео':ready?'Загружаю видео…':label}</span>{failed&&<Button variant="outline" onClick={retry}>Повторить загрузку</Button>}</div>}
  </section>
  {url&&<div className="chat-video-actions">{playbackError&&<span role="status">Браузер не воспроизводит этот ролик. Скачайте его и откройте в видеоплеере.</span>}<a href={url} download={`Omni-${image.id}.mp4`}><Download size={16}/>Скачать видео</a></div>}
 </div>;
}
