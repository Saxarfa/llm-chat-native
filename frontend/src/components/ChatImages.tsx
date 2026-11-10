import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {ImagePlus,RefreshCw} from '../icons';
import {ArtViewer} from './ArtViewer';
import {ChatVideo} from './ChatVideo';
import {fitArtRect} from './artViewerGeometry';
import {IconButton} from './primitives';
import {chatArtCache} from '../chatArtCache';
import {failure} from '../store';
import {RevealRegion} from './Reveal';
import {motionDuration,fadeTransition} from '../motion';
import type {GeneratedImage} from '../types';
import './ChatArt.css';

const labels:Record<string,string>={queued:'Подготовка изображения',preparing:'Освобождаю память LLM',generating:'Генерирую изображение',done:'Готово',error:'Не удалось создать изображение',cancelled:'Генерация остановлена'};
async function loadArt(id:string,preview:boolean){
 const response=await fetch(`/api/images/${encodeURIComponent(id)}/image/0${preview?'?preview=true&preview_size=960':''}`,{headers:window.storageManager.getAuthHeaders(),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Не удалось загрузить арт');
 const blob=await response.blob(),url=URL.createObjectURL(blob);
 try{const image=new Image();image.decoding='async';image.src=url;await image.decode();return {url,size:Math.max(blob.size,image.naturalWidth*image.naturalHeight*4)}}
 catch(error){URL.revokeObjectURL(url);throw error}
}
function GeneratingArt({image}:{image:GeneratedImage}){
 const reduced=useReducedMotion();
 return <motion.div className="chat-art-generating" role="img" aria-label={image.status==='done'?'Загружаю изображение…':labels[image.status]||'Подготавливаю изображение…'} initial={false} animate={{opacity:1}} exit={{opacity:0}} transition={fadeTransition(reduced,.25)}>
  <div className="chat-art-atmosphere" aria-hidden="true"><i/><i/><i/><i/></div><div className="chat-art-grain" aria-hidden="true"/>
  
 </motion.div>;
}
function ChatImage({image,eager=false}:{image:GeneratedImage;phase?:string;eager?:boolean}){
 const originalKey=`${window.storageManager.currentUser?.id||'local'}:${image.id}`,cacheKey=`${originalKey}:preview960`,cached=useRef(!!chatArtCache.peek(cacheKey));
 const reduced=useReducedMotion(),frame=useRef<HTMLElement>(null),source=useRef<HTMLButtonElement>(null),[url,setUrl]=useState(()=>chatArtCache.peek(cacheKey)),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(false);
 const [requested,setRequested]=useState(()=>eager||cached.current);
 const [original,setOriginal]=useState('');
 useEffect(()=>{
  if(!open){setOriginal('');return}
  let alive=true;const asset=chatArtCache.retain(originalKey,()=>loadArt(image.id,false));
  void asset.promise.then(value=>{if(alive)setOriginal(value)},error=>{if(alive){setOpen(false);failure(error)}});
  return()=>{alive=false;asset.release()};
 },[open,originalKey,image.id]);
 const ready=image.status==='done'&&image.image_count>0,busy=['queued','preparing','generating'].includes(image.status);
 useEffect(()=>{
  // Saved conversations may contain hundreds of completed artworks. Mounting
  // their rows must not fetch/decode every preview or pin all of them in the
  // decoded cache at once. Current generations and cache hits remain immediate;
  // historical frames start loading shortly before entering the viewport.
  if(eager||busy){setRequested(true);return}
  if(requested)return;
  const element=frame.current;if(!element)return;
  if(typeof IntersectionObserver==='undefined'){setRequested(true);return}
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting)){setRequested(true);observer.disconnect()}
  },{root:element.closest('.message-scroll'),rootMargin:'600px 0px'});
  observer.observe(element);
  return()=>observer.disconnect();
 },[eager,busy,requested]);
 useEffect(()=>{
  if(!ready||!requested)return;
  let alive=true;setError('');setUrl(chatArtCache.peek(cacheKey));
  const asset=chatArtCache.retain(cacheKey,()=>loadArt(image.id,true));
  void asset.promise.then(value=>{if(alive)setUrl(value)},error=>{if(alive)setError(error instanceof Error?error.message:String(error))});
  return()=>{alive=false;asset.release()};
 },[cacheKey,image.id,ready,requested,attempt]);
 const origin=()=>{const rect=source.current?.getBoundingClientRect();return rect?fitArtRect({x:rect.x,y:rect.y,width:rect.width,height:rect.height},image.width/image.height):null};
 const frameStyle={'--chat-art-ratio':image.width/image.height,'--chat-art-width':`${image.width}px`} as CSSProperties;
 return <motion.section ref={frame} className="chat-art chat-art-refined" style={frameStyle} initial={false} animate={{opacity:1}} aria-label={image.provider==="aistudio"?"Изображение из AI Studio":"Изображение из ComfyUI"}>
  {url&&<button ref={source} className="chat-art-preview" aria-label="Открыть арт на весь экран" onClick={()=>setOpen(true)}><motion.img src={url} decoding="async" width={image.width} height={image.height} alt="Сгенерированный арт" draggable={false} initial={cached.current?false:{opacity:0}} animate={{opacity:1}} transition={fadeTransition(reduced,motionDuration.detail)}/></button>}
  <AnimatePresence initial={false}>{!url&&(busy||ready&&requested&&!error)&&<GeneratingArt key="generating" image={image}/>}</AnimatePresence>
  <AnimatePresence initial={false}>{!url&&!busy&&(!ready||error)&&<motion.div key="placeholder" className="chat-art-placeholder" role="status" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={fadeTransition(reduced,motionDuration.detail)}><ImagePlus size={24}/><span>{error||image.error||labels[image.status]}</span>{error&&<IconButton label="Повторить загрузку изображения" onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={16}/></IconButton>}</motion.div>}</AnimatePresence>
  {url&&<ArtViewer open={open} onOpenChange={setOpen} frame={{job:image,url:original||url}} status={open&&!original?'Загружаю оригинал…':undefined} imageId={image.id} previous={null} getSourceRect={origin} restoreFocus={()=>source.current?.focus({preventScroll:true})}/>}
 </motion.section>;
}
export function ChatImages({images,phase,animateEntry=false,eager=false}:{images:GeneratedImage[];phase?:string;animateEntry?:boolean;eager?:boolean}){return <div className="chat-arts"><AnimatePresence initial={animateEntry}>{images.map(image=><RevealRegion key={image.id} className="chat-art-reveal" duration={motionDuration.surface}>{image.media_kind==='video'?<ChatVideo image={image}/>:<><ChatImage image={image} phase={phase} eager={eager}/>{image.model==='aistudio/gemini-nano-banana-2.1'&&<p className="chat-image-parameters">Nano Banana 2.1 · {image.aspect_ratio==='auto'?'Авто':image.aspect_ratio} · {image.image_size}</p>}</>}</RevealRegion>)}</AnimatePresence></div>}
