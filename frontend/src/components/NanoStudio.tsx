import {HintButton} from './Hint';
import {Fragment,createContext,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {softTransition} from '../motion';
import {
 AlertCircle,ArrowDown,ArrowLeft,ArrowUp,Check,ChevronDown,
 Columns,Copy,Download,GitBranch,History,Image as ImageIcon,
 ImagePlus,Images,Loader2,Minus,MoreVertical,PanelLeft,Pencil,Plus,RotateCcw,
 Search,SlidersHorizontal,Sparkles,Square,Star,Trash2,Video,X,ZoomIn,ZoomOut
} from '../icons';
import {api} from '../store';
import {Markdown} from './Messages';
import {IconButton,Button,copyText} from './primitives';
import {Select,SelectOption} from './Select';
import {ChatComposerEditor,type EditorCallbacks} from './ChatComposerEditor';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui/dropdown-menu';
import {useNanoChat} from './useNanoChat';
import {mergeNanoText,nanoFailure,nanoPath,nanoPending,nanoTextOnly,type NanoEntry,type NanoPart,type NanoSession} from './nanoTypes';
import type {StudioJob} from './studioTypes';
import {NanoMediaAccount,NanoPreview,nanoMediaPath,nanoMediaElement,nanoMediaReady,useNanoMedia,useNearMedia} from './useNanoMedia';
import {nanoMediaCache} from './nanoMedia';
import {NanoProgress} from './NanoProgress';
import './NanoStudio.css';

function NanoPanel({open,className='',children,...props}:React.ComponentProps<typeof Dialog.Content>&{open:boolean}){
 const reduced=useReducedMotion(),viewer=className.includes('nano-lightbox');
 const drawer=className.includes('nano-history-drawer')||(className.includes('nano-settings-overlay')&&typeof window!=='undefined'&&window.matchMedia('(min-width:801px)').matches);
 const offset=viewer?'0px 0px':drawer?'24px 0px':'0px 8px';
 return <Dialog.Content {...props} asChild><motion.div className={`${className} nano-motion-panel`} initial={reduced?false:{opacity:0,translate:offset,...(viewer?{scale:.985}:{})}} animate={{opacity:open?1:0,translate:open?'0px 0px':offset,...(viewer?{scale:open?1:.985}:{})}} transition={softTransition(reduced,open?(viewer?.20:.24):.18)}>{children}</motion.div></Dialog.Content>;
}

function groupSessionsByDate(sessions: NanoSession[]) {
 const now = new Date();
 const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
 const yesterdayStart = todayStart - 86400000;

 const today: NanoSession[] = [];
 const yesterday: NanoSession[] = [];
 const earlier: NanoSession[] = [];

 for (const session of sessions) {
  const time = (session.updated || session.created) * 1000;
  if (time >= todayStart) today.push(session);
  else if (time >= yesterdayStart) yesterday.push(session);
  else earlier.push(session);
 }

 const groups: {title: string; items: NanoSession[]}[] = [];
 if (today.length) groups.push({title: 'Сегодня', items: today});
 if (yesterday.length) groups.push({title: 'Вчера', items: yesterday});
 if (earlier.length) groups.push({title: 'Ранее', items: earlier});
 return groups;
}

const useOriginal=useNanoMedia;
// Keep pixels leased through CSS exit; the action/focus close immediately.
function useExitValue<T>(value:T|null){const reduced=useReducedMotion(),[held,setHeld]=useState(value);useEffect(()=>{if(value!==null){setHeld(value);return}if(held===null)return;const timer=setTimeout(()=>setHeld(null),200);return()=>clearTimeout(timer)},[value,held]);return value??(reduced?null:held)}
const NanoDraftPresence=createContext(false);
function NanoRetryButton({blocked,onPrepare,label='Подготовить повтор'}:{blocked:boolean;onPrepare:()=>void;label?:string}){const hasDraft=useContext(NanoDraftPresence);return <button type="button" className="nano-action-chip" disabled={blocked||hasDraft} onClick={onPrepare}>{label}</button>}
function NanoHistoryThumb({jobId}:{jobId?:string}){return jobId?<NanoPreview part={{type:'image',kind:'image',id:jobId,index:0}} className="nano-history-thumb" interactive={false}/>:<span className="nano-history-thumb-fallback" aria-hidden="true"><ImagePlus size={14}/></span>}
function PartThumbnail({part,alt=''}:{part?:Extract<NanoPart,{type:'image'}>;alt?:string}){return part?<NanoPreview part={part} alt={alt} className="nano-thumb-img"/>:<span className="nano-thumb-loading"/>}

interface NanoLightboxDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 url?: string;
 title?: string;
 onCloseAutoFocus?: (e: Event) => void;
 actions?: React.ReactNode;
}

function NanoLightboxDialog({
 open,
 onOpenChange,
 url,
 title,
 onCloseAutoFocus,
 actions
}: NanoLightboxDialogProps) {
 const [zoom, setZoom] = useState(1);
 const [pan, setPan] = useState({ x: 0, y: 0 });
 const stageRef = useRef<HTMLDivElement>(null);
 const isDraggingRef = useRef(false);
 const didDragRef = useRef(false);
 const dragStartPos = useRef({ x: 0, y: 0 });
 const dragStartPan = useRef({ x: 0, y: 0 });
 const touchStartPos = useRef({ x: 0, y: 0 });
 const touchStartPan = useRef({ x: 0, y: 0 });
 const pinchStartDist = useRef(0);
 const pinchStartZoom = useRef(1);

 useEffect(() => {
  if (open) {
   setZoom(1);
   setPan({ x: 0, y: 0 });
  }
 }, [open, url]);

 useEffect(() => {
  if (!open) return;
  const onKeyDown = (e: KeyboardEvent) => {
   if (e.key === '+' || e.key === '=') {
    setZoom(z => Math.min(z * 1.25, 6));
   } else if (e.key === '-' || e.key === '_') {
    setZoom(z => {
     const next = Math.max(z / 1.25, 1);
     if (next <= 1.01) setPan({ x: 0, y: 0 });
     return next;
    });
   } else if (e.key === '0') {
    setZoom(1);
    setPan({ x: 0, y: 0 });
   }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
 }, [open]);

 const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
  e.preventDefault();
  e.stopPropagation();
  const stage = stageRef.current;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - rect.width / 2;
  const mouseY = e.clientY - rect.top - rect.height / 2;

  const factor = e.deltaY < 0 ? 1.25 : 0.8;
  setZoom(prevZoom => {
   const nextZoom = Math.min(Math.max(prevZoom * factor, 1), 6);
   if (nextZoom <= 1.02) {
    setPan({ x: 0, y: 0 });
    return 1;
   }
   const ratio = nextZoom / prevZoom;
   setPan(prevPan => ({
    x: mouseX - (mouseX - prevPan.x) * ratio,
    y: mouseY - (mouseY - prevPan.y) * ratio
   }));
   return nextZoom;
  });
 };

 const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
  if (e.button !== 0) return;
  isDraggingRef.current = true;
  didDragRef.current = false;
  dragStartPos.current = { x: e.clientX, y: e.clientY };
  dragStartPan.current = { ...pan };
  try {
   e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
 };

 const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!isDraggingRef.current) return;
  const dx = e.clientX - dragStartPos.current.x;
  const dy = e.clientY - dragStartPos.current.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
   didDragRef.current = true;
  }
  setPan({
   x: dragStartPan.current.x + dx,
   y: dragStartPan.current.y + dy
  });
 };

 const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
  if (!isDraggingRef.current) return;
  isDraggingRef.current = false;
  try {
   e.currentTarget.releasePointerCapture(e.pointerId);
  } catch {}

  if (!didDragRef.current) {
   if (zoom > 1.1) {
    setZoom(1);
    setPan({ x: 0, y: 0 });
   } else {
    const stage = stageRef.current;
    if (stage) {
     const rect = stage.getBoundingClientRect();
     const cursorX = e.clientX - rect.left - rect.width / 2;
     const cursorY = e.clientY - rect.top - rect.height / 2;
     const nextZoom = 2.4;
     setPan({
      x: -cursorX * (nextZoom - 1),
      y: -cursorY * (nextZoom - 1)
     });
     setZoom(nextZoom);
    } else {
     setZoom(2.4);
    }
   }
  }
 };

 const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
  if (e.touches.length === 1) {
   touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
   touchStartPan.current = { ...pan };
  } else if (e.touches.length === 2) {
   pinchStartDist.current = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
   );
   pinchStartZoom.current = zoom;
  }
 };

 const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
  if (e.touches.length === 1 && zoom > 1) {
   const dx = e.touches[0].clientX - touchStartPos.current.x;
   const dy = e.touches[0].clientY - touchStartPos.current.y;
   setPan({
    x: touchStartPan.current.x + dx,
    y: touchStartPan.current.y + dy
   });
  } else if (e.touches.length === 2 && pinchStartDist.current > 0) {
   const dist = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY
   );
   const factor = dist / pinchStartDist.current;
   const nextZoom = Math.min(Math.max(pinchStartZoom.current * factor, 1), 6);
   setZoom(nextZoom);
   if (nextZoom <= 1.01) setPan({ x: 0, y: 0 });
  }
 };

 return (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
   <Dialog.Portal>
    <Dialog.Overlay className="nano-lightbox-backdrop"/>
    <NanoPanel open={open} className="nano-lightbox" aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
     <Dialog.Title className="sr-only">{title || 'Увеличенный просмотр изображения'}</Dialog.Title>

     <div
      ref={stageRef}
      className={`nano-lightbox-stage ${zoom > 1 ? 'is-zoomed' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      style={{
       cursor: zoom > 1 ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'zoom-in'
      }}
     >
      {url && (
       <img
        key={url} ref={nanoMediaElement} onLoad={nanoMediaReady}
        src={url}
        alt={title || 'Изображение'}
        draggable={false}
        style={{
         transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
         transition: isDraggingRef.current ? 'none' : 'transform 0.16s cubic-bezier(0.2, 0, 0, 1)'
        }}
       />
      )}
     </div>

     <div className="nano-lightbox-topbar">
      <div className="nano-lightbox-meta">
       {title && <span className="nano-lightbox-title">{title}</span>}
       <span className="nano-lightbox-hint">Колёсико — масштаб, перетаскивание — обзор</span>
      </div>

      <div className="nano-lightbox-controls">
       <HintButton
        type="button"
        className="nano-lightbox-tool"
        hint="Уменьшить (-)"
        disabled={zoom <= 1.05}
        onClick={() => {
         setZoom(z => {
          const next = Math.max(z / 1.3, 1);
          if (next <= 1.01) setPan({ x: 0, y: 0 });
          return next;
         });
        }}
       >
        <Minus size={16}/>
       </HintButton>

       <button
        type="button"
        className="nano-lightbox-zoom-badge"
        title="Сбросить масштаб (100%)"
        onClick={() => {
         setZoom(1);
         setPan({ x: 0, y: 0 });
        }}
       >
        <span>{Math.round(zoom * 100)}%</span>
       </button>

       <HintButton
        type="button"
        className="nano-lightbox-tool"
        hint="Увеличить (+)"
        disabled={zoom >= 5.8}
        onClick={() => {
         setZoom(z => Math.min(z * 1.3, 6));
        }}
       >
        <Plus size={16}/>
       </HintButton>

       <Dialog.Close asChild>
        <IconButton label="Закрыть (Esc)" className="nano-lightbox-close"><X size={18}/></IconButton>
       </Dialog.Close>
      </div>
     </div>

     {actions && (
      <div className="nano-lightbox-bottombar">
       {actions}
      </div>
     )}
    </NanoPanel>
   </Dialog.Portal>
  </Dialog.Root>
 );
}

function NanoImage({part,onAttach,onCompare,disabled=false,small=false,dimensions}:{part:Extract<NanoPart,{type:'image'}>;onAttach?:()=>void;onCompare?:(source?:HTMLElement)=>void;disabled?:boolean;small?:boolean;dimensions?:{width:number;height:number}}){
 const account=useContext(NanoMediaAccount),{host,near}=useNearMedia();
 const [open,setOpen]=useState(false),[favorite,setFavorite]=useState(false),[downloadError,setDownloadError]=useState(false),[downloading,setDownloading]=useState(false),[loadedDimensions,setLoadedDimensions]=useState<{width:number;height:number}>(),trigger=useRef<HTMLButtonElement>(null);
 const heldOriginal=useExitValue(open?part:null);
 const preview=useNanoMedia(part,true,near,small?320:960),original=useOriginal(heldOriginal||undefined);
 const {url,failed,retry}=preview;
 const saveOriginal=async()=>{if(downloading)return;setDownloading(true);setDownloadError(false);try{const media=await nanoMediaCache.load(account,nanoMediaPath(part),window.storageManager.getAuthHeaders());try{const link=document.createElement('a');link.href=media.url;link.download=`Nano-${part.id}.${media.mime==='image/jpeg'?'jpg':media.mime==='image/webp'?'webp':'png'}`;document.body.append(link);link.click();link.remove()}finally{media.release()}}catch{setDownloadError(true)}finally{setDownloading(false)}};
 const generated=part.kind==='image';

 useEffect(()=>{
  let alive=true;
  if(near&&generated&&!small)void api(`/api/images/${part.id}`).then(result=>{if(alive){setFavorite(!!result.job?.favorite);if(result.job?.width&&result.job.height)setLoadedDimensions(result.job)}}).catch(()=>{});
  return()=>{alive=false};
 },[part.id,generated,small,near]);

 const toggleFavorite = () => {
  void api(`/api/images/${part.id}/favorite`,'PATCH',{favorite:!favorite}).then(result=>{
   setFavorite(!!result.job.favorite);
   window.dispatchEvent(new Event('studio-history-changed'));
  }).catch(()=>{});
 };

 const shape=dimensions?.width&&dimensions.height?dimensions:loadedDimensions;
 return <div ref={host} style={shape?{width:`min(100%, calc(var(--nano-media-height, min(66dvh, 720px)) * ${shape.width/shape.height}))`}:undefined} className={`nano-image ${small?'is-reference':''}`}>
  <button ref={trigger} type="button" className="nano-image-open" style={shape?{aspectRatio:`${shape.width}/${shape.height}`,width:'100%'}:undefined} aria-label={failed?'Повторить загрузку изображения':'Открыть изображение на весь экран'} disabled={!url&&!failed} onClick={()=>failed?retry():setOpen(true)}>
   {url?<img key={url} ref={nanoMediaElement} onLoad={nanoMediaReady} src={url} alt={generated?'Результат Nano Banana':'Референс'} loading="lazy" draggable={false} onError={preview.fail}/>:<span>{failed?<><RotateCcw size={18}/>Загрузить снова</>:'Загружаю изображение…'}</span>}
   {!small && url && (
    <span className="nano-image-zoom-hint">
     <ZoomIn size={14}/>
     <span>Увеличить</span>
    </span>
   )}
  </button>

  {!small && url && (
   <div className="nano-image-hover-actions">
    {onAttach && <IconButton label="Прикрепить к запросу" disabled={disabled} onClick={onAttach}><ImagePlus size={16}/></IconButton>}
    {onCompare && <IconButton label="Сравнить изображения" onClick={()=>onCompare?.(trigger.current||undefined)}><Columns size={16}/></IconButton>}
    {generated && <IconButton label={favorite?'В избранном':'В избранное'} onClick={toggleFavorite}><Star size={14} fill={favorite?'currentColor':'none'}/></IconButton>}
    <IconButton label={downloading?'Загружаю оригинал':'Скачать оригинал'} disabled={downloading} onClick={()=>void saveOriginal()}><Download size={14}/></IconButton>
   </div>
  )}

  {downloadError&&<small role="alert">Не удалось скачать оригинал. <button type="button" onClick={()=>void saveOriginal()}>Повторить</button></small>}
  <NanoLightboxDialog
   open={open}
   onOpenChange={setOpen}
   url={original.url}
   title={generated ? 'Результат Nano Banana' : 'Референс'}
   onCloseAutoFocus={e => { e.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}
   actions={
    <>
     {onAttach && <Button type="button" variant="outline" className="nano-lightbox-action" disabled={disabled} onClick={()=>{setOpen(false);onAttach()}}><ImagePlus size={14}/><span>Прикрепить к запросу</span></Button>}
     {onCompare && <Button type="button" variant="outline" className="nano-lightbox-action" onClick={()=>{setOpen(false);onCompare(trigger.current||undefined)}}><Columns size={14}/><span>Сравнить</span></Button>}
     {generated && <Button type="button" variant="outline" className="nano-lightbox-action" onClick={toggleFavorite}><Star size={14} fill={favorite?'currentColor':'none'}/><span>{favorite?'В избранном':'В избранное'}</span></Button>}
     <Button variant="outline" disabled={downloading} onClick={()=>void saveOriginal()}><Download size={14}/><span>Скачать</span></Button>
     {original.failed&&<Button variant="outline" onClick={original.retry}>Повторить загрузку оригинала</Button>}
    </>
   }
  />
 </div>;
}

function NanoVideo({part}:{part:Extract<NanoPart,{type:'video'}>}){
 const {url,failed,retry}=useOriginal(part),[playbackError,setPlaybackError]=useState(false);
 useEffect(()=>setPlaybackError(false),[url]);
 return <div className="nano-video">
  {url?<video src={url} controls playsInline preload="metadata" onError={()=>setPlaybackError(true)} aria-label="Видео Gemini Omni"/>:<button type="button" disabled={!failed} onClick={retry}>{failed?'Не удалось загрузить видео. Повторить':'Загружаю видео…'}</button>}
  {playbackError&&<p className="nano-connection" role="status">Браузер не смог воспроизвести видео. Можно скачать оригинал.<button type="button" onClick={retry}>Повторить</button></p>}
  <div className="nano-image-actions">
   {url&&<a href={url} download={`Omni-${part.id}.mp4`} aria-label="Скачать видео"><Download size={16}/></a>}
  </div>
 </div>;
}


function NanoGalleryCard({art,disabled,onSelect}:{art:StudioJob;disabled:boolean;onSelect:()=>Promise<boolean>}){
 const {host,near}=useNearMedia<HTMLButtonElement>(),{url,failed,retry,fail}=useNanoMedia({type:'image',kind:'image',id:art.id,index:0},true,near),[selecting,setSelecting]=useState(false);
 const description=art.prompt||'Изображение без описания';
 return <button ref={host} type="button" className="nano-gallery-card" disabled={disabled||selecting} data-selecting={selecting||undefined} aria-label={failed?'Повторить загрузку миниатюры':`Выбрать изображение: ${description}`} title={description} onClick={()=>{if(failed){retry();return}setSelecting(true);void onSelect().finally(()=>setSelecting(false))}}>
  <div className="nano-gallery-thumb-wrap"><span className={`studio-history-thumbnail ${url?'is-ready':''} ${failed?'is-failed':''}`}>{url?<img key={url} ref={nanoMediaElement} onLoad={nanoMediaReady} src={url} alt="" draggable={false} onError={fail}/>:failed?<><RotateCcw size={24}/><span>Повторить загрузку</span></>:<ImagePlus size={24}/>}</span><span className="nano-gallery-card-badge" aria-hidden="true">{selecting?<Loader2 size={16}/>:<ImagePlus size={16}/>}<span>{selecting?'Прикрепляю…':'Прикрепить'}</span></span></div>
  <div className="nano-gallery-card-meta"><span className="nano-gallery-card-prompt">{description}</span><span className="nano-gallery-card-dimensions">{art.width&&art.height?`${art.width} × ${art.height}`:'Изображение'}</span></div>
 </button>;
}

type ImagePart = Extract<NanoPart,{type:'image'}>;
type ChatImage = {key:string;part:ImagePart;label:string};
const imageKey=(part:ImagePart)=>`${part.kind}:${part.id}:${part.index}`;

function NanoStudioContent({userId,entry,active,onMenu,onChat,showMenuButton,onConnection}:{userId:string;entry?:NanoEntry;active:boolean;onMenu:()=>void;onChat:()=>void;showMenuButton:boolean;onConnection?:()=>void;onModeChange?:(mode:'images'|'nano'|'video')=>void}){
 const chat=useNanoChat(userId,entry),reduced=useReducedMotion();
 const historyOpener=useRef<HTMLButtonElement>(null),settingsOpener=useRef<HTMLButtonElement>(null),modelOpener=useRef<HTMLButtonElement>(null),addOpener=useRef<HTMLButtonElement>(null),compareOpener=useRef<HTMLElement|null>(null);
 const returnFocus=(event:Event,element:HTMLElement|null)=>{event.preventDefault();if(element?.isConnected)element.focus({preventScroll:true})};
 const [historyQuery,setHistoryQuery]=useState(''),[historyDrawer,setHistoryDrawer]=useState(false);
 const [modelPicker,setModelPicker]=useState(false),[modelNotice,setModelNotice]=useState('');
 const [advanced,setAdvanced]=useState(false),[wide,setWide]=useState(()=>window.matchMedia('(min-width:1100px)').matches),[narrow,setNarrow]=useState(()=>window.matchMedia('(max-width:359px)').matches);
 const [gallery,setGallery]=useState(false),[arts,setArts]=useState<StudioJob[]>([]),[galleryQuery,setGalleryQuery]=useState('');
 const [galleryError,setGalleryError]=useState(''),[galleryLoading,setGalleryLoading]=useState(false);
 const [rename,setRename]=useState<string|null>(null),[renameText,setRenameText]=useState(''),[confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const [dragging,setDragging]=useState(false),[menu,setMenu]=useState<string|null>(null),[copied,setCopied]=useState('');
 const [comparison,setComparison]=useState<{a:string;b:string}|null>(null),[showLatest,setShowLatest]=useState(false);
 const field=useRef<HTMLTextAreaElement|null>(null),file=useRef<HTMLInputElement>(null),feed=useRef<HTMLDivElement>(null),feedContent=useRef<HTMLDivElement>(null);
 const galleryPanel=useRef<HTMLDivElement>(null);
 const searchInput=useRef<HTMLInputElement>(null),historyTouch=useRef<{x:number;y:number}|null>(null),composing=useRef(false),stick=useRef(true),send=useRef(()=>{});
 const followFrame=useRef<number|null>(null);
 const followingHead=useRef(true);
 const escapePanel=useRef<()=>boolean>(()=>false);
 escapePanel.current=()=>{if(rename){setRename(null);return true}if(confirmDelete){setConfirmDelete(null);return true}if(comparison){setComparison(null);return true}if(gallery){setGallery(false);return true}if(modelPicker){setModelPicker(false);return true}if(historyDrawer){setHistoryDrawer(false);return true}if(!wide&&advanced){setAdvanced(false);return true}return false};
 const callbacks=useRef<EditorCallbacks>({input:()=>{},blur:()=>{},composition:()=>{},paste:()=>{},drop:()=>{},key:()=>{}});
 const pending=nanoPending(chat.view?.active_job),branchBlocked=!!chat.continuation&&chat.continuation.status!=='selected';
 const uploadBlocked=chat.uploads.some(item=>item.status==='failed');
 const blocked=chat.busy||pending||chat.uncertain||branchBlocked,settings=chat.settings,isVideo=chat.config?.output_kind==='video';
 const head=chat.view?.session.head_id||null;
 const activeUser=chat.view?.active_job?chat.view.messages.find(m=>m.role==='user'&&m.job.id===chat.view!.active_job!.id):null;
 const failed=[...(chat.view?.messages||[])].reverse().find(m=>m.role==='user'&&m.parent_id===head&&['error','cancelled'].includes(m.job.status));
 const path=useMemo(()=>nanoPath(chat.view?.messages||[],activeUser?.id||failed?.id||head),[chat.view?.messages,activeUser?.id,failed?.id,head]),preview=chat.view?.active_job?.preview_text;
 const lastPathImage=useMemo(()=>path.flatMap(message=>message.role==='model'?message.content.filter((part):part is ImagePart=>part.type==='image'):[]).at(-1),[path]);
 const isWelcome=!chat.view?.messages.length&&!chat.view?.root_job&&!pending;
 const images=useMemo<ChatImage[]>(()=>{
  const result:ChatImage[]=[],seen=new Set<string>();
  const add=(part:ImagePart,label:string)=>{const key=imageKey(part);if(!seen.has(key)){seen.add(key);result.push({key,part,label})}};
  if(chat.view?.root_job)add({type:'image',kind:'image',id:chat.view.root_job.id,index:0},chat.view.root_job.prompt||'Исходное изображение');
  for(const message of chat.view?.messages||[]){if(message.role!=='model')continue;for(const part of message.content||[]){if(part.type==='image')add(part,chat.view?.messages.find(m=>m.id===message.parent_id)?.text||message.job.prompt||'Изображение')}}
  return result;
 },[chat.view]);
 const shownComparison=useExitValue(comparison);
 const {url:compareA,failed:compareFailedA,retry:retryCompareA}=useOriginal(shownComparison?images.find(i=>i.key===shownComparison.a)?.part:undefined);
 const {url:compareB,failed:compareFailedB,retry:retryCompareB}=useOriginal(shownComparison?images.find(i=>i.key===shownComparison.b)?.part:undefined);
 const openCompare=(part:ImagePart,source?:HTMLElement)=>{compareOpener.current=source||null;const key=imageKey(part),other=images.find(i=>i.key!==key);if(other)setComparison({a:key,b:other.key})};
 const focus=()=>field.current?.focus({preventScroll:true});
 const followHead=()=>{
  followingHead.current=true;stick.current=true;
  if(followFrame.current!==null)cancelAnimationFrame(followFrame.current);
  followFrame.current=requestAnimationFrame(()=>{followFrame.current=null;stick.current=true;setShowLatest(false);if(feed.current)feed.current.scrollTop=feed.current.scrollHeight});
 };
 const branch=async(id:string|null)=>{if(await chat.selectHead(id)){followHead();focus()}};
 const restoreHead=async()=>{if(await chat.returnToHead()){followHead();focus()}};
 const startNew=()=>{setModelNotice('');void chat.create()};
 const attach=(part:ImagePart)=>{void chat.attachImage(part).then(ok=>{if(ok)focus()})};
 const handleSend=async()=>{if(blocked||uploadBlocked||!chat.draft.text.trim())return;await chat.send()};
 send.current=()=>void handleSend();
 callbacks.current={
  input:text=>chat.setDraft(value=>({...value,text})),blur:()=>{},composition:value=>{composing.current=value},
  paste:event=>{const files=Array.from(event.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(files.length){event.preventDefault();void chat.upload(files)}},
  drop:event=>{event.preventDefault();void chat.upload(Array.from(event.dataTransfer?.files||[]))},
  key:event=>{if(event.key==='Escape'&&escapePanel.current()){event.preventDefault()}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setHistoryDrawer(true)}else if(event.key==='Enter'&&!event.shiftKey&&!composing.current&&!event.isComposing&&(event.ctrlKey||event.metaKey||!matchMedia('(pointer:coarse)').matches)){event.preventDefault();send.current()}}
 };
 useLayoutEffect(()=>{if(field.current&&field.current.value!==chat.draft.text){field.current.value=chat.draft.text;field.current.dispatchEvent(new Event('input',{bubbles:true}))}},[chat.draft.text,chat.view?.session.id,chat.loading]);
 // Radix keeps the content mounted during exit. Reopening before it finishes
 // does not mount a new FocusScope; reclaim focus from the iOS editor iframe.
 useLayoutEffect(()=>{if(historyDrawer)searchInput.current?.focus({preventScroll:true});if(gallery)galleryPanel.current?.focus({preventScroll:true})},[historyDrawer,gallery]);
 useLayoutEffect(()=>{
  const input=field.current;if(!input)return;
  const frame=input.ownerDocument.defaultView?.frameElement;
  const owner=frame?.parentElement||input.parentElement;if(!owner)return;
  let paint:number|undefined,target=0;
  const resize=()=>{const height=input.getBoundingClientRect().height;if(height<=0)return;target=Math.min(160,Math.max(32,height));if(paint===undefined)paint=requestAnimationFrame(()=>{paint=undefined;if(owner.style.height!==`${target}px`)owner.style.height=`${target}px`})};
  resize();const observer=new ResizeObserver(resize);observer.observe(input);
  return()=>{observer.disconnect();if(paint!==undefined)cancelAnimationFrame(paint);owner.style.removeProperty('height')};
 },[]);
 useLayoutEffect(()=>{if(active){followingHead.current=true;stick.current=true;setShowLatest(false);const node=feed.current;if(node)node.scrollTop=node.scrollHeight}},[chat.view?.session.id,active]);
 useLayoutEffect(()=>{const node=feed.current,content=feedContent.current;if(!node||!content)return;const observer=new ResizeObserver(()=>{if(stick.current)node.scrollTop=node.scrollHeight});observer.observe(content);observer.observe(node);return()=>observer.disconnect()},[]);
 useLayoutEffect(()=>{const node=feed.current;if(node&&stick.current)node.scrollTop=node.scrollHeight},[path.length,preview,head]);
 useEffect(()=>{const query=matchMedia('(min-width:1100px)'),small=matchMedia('(max-width:359px)'),update=()=>{setWide(query.matches);setNarrow(small.matches)};query.addEventListener('change',update);small.addEventListener('change',update);return()=>{query.removeEventListener('change',update);small.removeEventListener('change',update)}},[]);
 useEffect(()=>{setComparison(null)},[chat.view?.session.id]);
 useEffect(()=>{setModelNotice('')},[entry?.nonce,userId]);
 useEffect(()=>()=>{if(followFrame.current!==null)cancelAnimationFrame(followFrame.current)},[]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(''),1800);return()=>clearTimeout(timer)},[copied]);
 useEffect(()=>{if(!gallery)return;let alive=true;setGalleryLoading(true);const timer=setTimeout(()=>{void api('/api/images/history/search','POST',{q:galleryQuery,limit:60,offset:0,order:'newest'}).then(data=>{if(alive){setArts((data.jobs||[]).filter((job:StudioJob)=>job.images?.length));setGalleryError('');setGalleryLoading(false)}}).catch(()=>{if(alive){setGalleryError('Не удалось загрузить галерею');setGalleryLoading(false)}})},150);return()=>{alive=false;clearTimeout(timer)}},[gallery,galleryQuery]);
 useEffect(()=>{if(!active)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&escapePanel.current()){e.preventDefault();e.stopPropagation()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();setHistoryDrawer(true)}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[active]);
 const selectSession=(id:string)=>{setHistoryDrawer(false);setMenu(null);setModelNotice('');void chat.select(id)};
 const filteredSessions=useMemo(()=>chat.sessions.filter(session=>{if(session.title==='Новый чат'&&!session.head_id&&!session.root_job_id&&session.id!==chat.view?.session.id)return false;return !historyQuery.trim()||(session.title||'').toLocaleLowerCase().includes(historyQuery.trim().toLocaleLowerCase())}),[chat.sessions,historyQuery,chat.view?.session.id]);
 const groupedSessions=useMemo(()=>groupSessionsByDate(filteredSessions),[filteredSessions]);
 const historyDrawerContent = (
  <>
   <div className="nano-history-heading">
    <div className="nano-history-heading-title">
     {showMenuButton && <IconButton label="Главное меню" className="nano-sidebar-main-menu" onClick={onMenu}><PanelLeft size={16}/></IconButton>}
     <span>История чатов</span>
    </div>
   </div>

   <label className="nano-history-search">
    <Search size={16}/>
    <input ref={searchInput} aria-label="Поиск чатов Nano Banana" placeholder="Поиск чатов" value={historyQuery} onChange={e => setHistoryQuery(e.target.value)}/>
    <kbd className="nano-search-kbd">Ctrl K</kbd>
   </label>

   <div className="nano-history-list">
    {!groupedSessions.length ? (
     <div className="nano-history-empty">{historyQuery ? 'Ничего не найдено' : 'Нет сохранённых чатов'}</div>
    ) : (
     groupedSessions.map(group => (
      <div key={group.title} className="nano-history-group">
       <div className="nano-history-group-title">{group.title}</div>
       {group.items.map(session => (
        <div key={session.id} className="nano-history-row" data-selected={session.id === chat.view?.session.id}>
         <button type="button" className="nano-history-row-main" onClick={() => selectSession(session.id)} disabled={chat.busy || chat.uncertain}>
          <NanoHistoryThumb jobId={session.thumbnail_job_id || session.root_job_id}/>
          <span title={session.title || 'Правки изображения'}>{session.title || 'Правки изображения'}</span>
         </button>
         <div className="nano-history-row-actions">
          <IconButton label="Переименовать чат" className="nano-hover-action" onClick={e => { e.stopPropagation(); setRename(session.id); setRenameText(session.title); }}><Pencil size={14}/></IconButton>
          <IconButton label="Удалить чат" className="nano-hover-action is-destructive" onClick={e => { e.stopPropagation(); setConfirmDelete(session.id); }}><Trash2 size={14}/></IconButton>
          <IconButton label={`Действия с чатом ${session.title}`} className="nano-mobile-action" aria-expanded={menu === session.id} onClick={e => { e.stopPropagation(); setMenu(menu === session.id ? null : session.id); }}><MoreVertical size={16}/></IconButton>
         </div>
         {menu === session.id && (
          <div className="nano-row-menu">
           <button type="button" onClick={() => { setRename(session.id); setRenameText(session.title); setMenu(null); }}><Pencil size={14}/>Переименовать</button>
           <button type="button" className="is-destructive" onClick={() => { setConfirmDelete(session.id); setMenu(null); }}><Trash2 size={14}/>Удалить чат</button>
          </div>
         )}
        </div>
       ))}
      </div>
     ))
    )}
   </div>
  </>
 );


 const parameters=(<>
  <header><div><h2 id="nano-settings-title">Параметры</h2><p>{chat.config?.name||'Nano Banana'}</p></div><IconButton label="Закрыть параметры" onClick={()=>setAdvanced(false)}><X size={18}/></IconButton></header>
      <div className="nano-settings-scroll">
       <fieldset disabled={blocked}>
        <label>Формат
         <Select aria-label="Формат Nano Banana" value={settings.aspect_ratio} onChange={e=>chat.options({aspect_ratio:e.target.value})}>
          {(chat.config?.aspect_ratios||['auto']).map(r=><SelectOption key={r} value={r}>{r==='auto'?'Авто':r}</SelectOption>)}
         </Select>
        </label>
        {isVideo ? <label>Разрешение видео
         <Select aria-label="Разрешение видео" value={settings.video_resolution||'720p'} onChange={e=>chat.options({video_resolution:e.target.value as typeof settings.video_resolution})}>
          {['360p','720p','1080p','4k'].map(r=><SelectOption key={r} value={r}>{r==='4k'?'4K':r}</SelectOption>)}
         </Select>
        </label> : <label>Разрешение
         <Select aria-label="Разрешение Nano Banana" value={settings.image_size} disabled={chat.config?.image_sizes.length===1} onChange={e=>chat.options({image_size:e.target.value})}>
          {(chat.config?.image_sizes||['1K']).map(r=><SelectOption key={r} value={r}>{r}</SelectOption>)}
         </Select>
        </label>}
        {!isVideo && (
         <label>Режим ответа
          <Select aria-label="Режим ответа" value={settings.response_mode} onChange={e => chat.options({response_mode: e.target.value as 'image'|'text_image'})}>
           <SelectOption value="text_image">Текст и изображения</SelectOption>
           <SelectOption value="image">Только изображения</SelectOption>
          </Select>
         </label>
        )}
        {isVideo && (
         <label>Длительность видео
          <Select aria-label="Длительность видео" value={String(settings.video_duration || 5)} onChange={e => chat.options({video_duration: Number(e.target.value)})}>
           {Array.from({length: 8}, (_, i) => i + 3).map(n => <SelectOption key={n} value={String(n)}>{n} сек.</SelectOption>)}
          </Select>
          <small>{path.some(message=>message.role==='model')?'При правках выбор добавляет пожелание в текст запроса. Точная длина зависит от модели.':'От 3 до 10 секунд для нового ролика.'}</small>
         </label>
        )}
        {chat.config?.features?.thinking_level && (
         <label>Рассуждения
          <Select aria-label="Рассуждения Nano Banana" value={settings.thinking} onChange={e => chat.options({thinking: e.target.value as typeof settings.thinking})}>
           <SelectOption value="default">По умолчанию Google</SelectOption>
           <SelectOption value="minimal">Минимальные</SelectOption>
           <SelectOption value="medium">Средние</SelectOption>
           <SelectOption value="high">Высокие</SelectOption>
          </Select>
         </label>
        )}
        {!isVideo && (
         <>
          <div className="nano-setting-switch">
           <label htmlFor="nano-web">Поиск Google<small>{chat.config?.features?.google_search ? 'Актуальная информация из интернета' : 'Недоступен в текущем подключении'}</small></label>
           <input id="nano-web" type="checkbox" checked={settings.google_search} disabled={!chat.config?.features?.google_search} onChange={e => chat.options({google_search: e.target.checked})}/>
          </div>
          <div className="nano-setting-switch">
           <label htmlFor="nano-image-search">Поиск изображений<small>{chat.config?.features?.image_search ? 'Визуальные источники Google' : 'Недоступен в текущем подключении'}</small></label>
           <input id="nano-image-search" type="checkbox" checked={settings.image_search} disabled={!chat.config?.features?.image_search} onChange={e => chat.options({image_search: e.target.checked})}/>
          </div>
         </>
        )}
        <label>Системная инструкция<textarea value={settings.system_instruction} maxLength={16000} rows={3} placeholder="Стиль и правила для всех ответов" onChange={e => chat.options({system_instruction: e.target.value})}/></label>
        <label>Максимальная длина ответа<input type="number" min={1} max={chat.config?.output_limit || 65536} value={settings.max_output_tokens ?? ''} placeholder="По умолчанию Google" onChange={e => chat.options({max_output_tokens: e.target.value ? Number(e.target.value) : null})}/></label>
        <label>Стоп-последовательности<textarea rows={2} value={settings.stop_sequences.join('\n')} placeholder="До 5, каждая с новой строки" onChange={e => chat.options({stop_sequences: e.target.value.split('\n').filter(Boolean).slice(0, 5)})}/></label>
        <Button variant="outline" onClick={() => void chat.patch({settings}).then(ok => { if (ok) setAdvanced(false); })}><Check size={14}/>Сохранить для чата</Button>
        <button className="nano-defaults" type="button" onClick={() => void chat.saveDefaults()}>Использовать в новых чатах</button>
       </fieldset>


       {!!chat.view?.messages.some(m=>m.role==='model')&&<section className="nano-branches">
        <h3>Продолжения</h3><p>Можно вернуться к любому ответу. Все ветки сохраняются.</p>
        {chat.view.messages.filter(m=>m.role==='model').map((m,i)=><button type="button" key={m.id} disabled={blocked} aria-pressed={m.id===head} onClick={()=>{void branch(m.id);if(!wide)setAdvanced(false)}}><GitBranch size={16}/><span>{chat.view?.messages.find(p=>p.id===m.parent_id)?.text||m.text||`Ответ ${i+1}`}</span>{m.id===head&&<Check size={16}/>}</button>)}
       </section>}
      </div>
 </>);
 const previousMessages=useRef<{session?:string;ids:Set<string>}>({ids:new Set()});
 const arrivals=useMemo(()=>{const prior=previousMessages.current,ids=new Set(chat.view?.messages.map(message=>message.id));previousMessages.current={session:chat.view?.session.id,ids};return prior.session===chat.view?.session.id?new Set([...ids].filter(id=>!prior.ids.has(id))):new Set<string>()},[chat.view?.messages,chat.view?.session.id]);
 const transcript=useMemo(()=>path.map(message=>{
        const isModel=message.role==='model',parts=mergeNanoText(message.content?.length?message.content:[{type:'text',text:message.text}]);
        const text=parts.filter((p):p is Extract<NanoPart,{type:'text'}>=>p.type==='text').map(p=>p.text).join('\n');
        return <Fragment key={message.id}><article className={`nano-message is-${message.role}`} data-message-id={message.id} data-arriving={arrivals.has(message.id)||undefined}>
         <div className="nano-message-name">{isModel?<><Sparkles size={16}/><span>{chat.models.find(m=>m.model===message.job.model)?.name||'Nano Banana'}</span></>:<span>Вы</span>}</div>
         <div className="nano-message-body">{parts.map((part,i)=>part.type==='image'?<NanoImage key={`${i}:${imageKey(part)}`} part={part} dimensions={part.kind==='image'&&part.id===message.job.id?message.job:undefined} small={!isModel} disabled={blocked} onAttach={isModel?()=>attach(part):undefined} onCompare={isModel&&images.length>1?source=>openCompare(part,source):undefined}/>:part.type==='video'?<NanoVideo key={`${i}:${part.id}`} part={part}/>:part.text?<div key={i} className={isModel?'nano-message-text markdown':'nano-message-text'}>{isModel?<Markdown text={part.text}/>:part.text}</div>:null)}
          {message.grounding&&(!!message.grounding.sources?.length||message.grounding.attribution||!!message.grounding.search_links?.length)&&<details className="nano-sources"><summary><Search size={14}/>Источники Google</summary>{message.grounding.sources?.map((source,i)=><a key={i} href={source.uri} target="_blank" rel="noopener noreferrer">{source.title}</a>)}{message.grounding.attribution&&<p>{message.grounding.attribution}</p>}{message.grounding.search_links?.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">Поисковая подсказка</a>)}</details>}
         </div>
         {isModel&&<div className="nano-unified-actions"><button type="button" className="nano-action-chip" disabled={blocked} onClick={()=>void branch(message.id)}><GitBranch size={14}/><span>Продолжить отсюда</span></button>{text&&<IconButton label={copied===message.id?'Скопировано':'Скопировать ответ'} onClick={()=>void copyText(text).then(()=>setCopied(message.id)).catch(()=>setCopied(''))}>{copied===message.id?<Check size={16}/>:<Copy size={16}/>}</IconButton>}</div>}
         {nanoTextOnly(message)&&<div className="nano-text-only nano-notice" role="status"><ImageIcon size={16}/><span>Ответ без изображения. Модель прислала только текст.</span>{message.id===head&&<NanoRetryButton label="Подготовить запрос картинки" blocked={blocked||!!chat.uploads.length} onPrepare={()=>{if(chat.prepareImage(message.id))focus()}}/>}</div>}
        </article>
        {!isModel&&message.job.status==='error'&&<div role="alert" className="nano-message-error"><AlertCircle size={18}/><div><strong>{nanoFailure(message.job).title}</strong><p>{nanoFailure(message.job).detail}</p>{onConnection&&['auth_required','401','403','image_unavailable'].includes(message.job.error_code||'')&&<button type="button" className="nano-action-chip" onClick={onConnection}>Подключение AI Studio</button>}{message.id===failed?.id&&<NanoRetryButton blocked={blocked} onPrepare={()=>void chat.prepareRetry().then(ok=>{if(ok)focus()})}/>}{message.job.error_code==='image_context_limit'&&!!lastPathImage&&<button type="button" className="nano-action-chip" disabled={blocked} onClick={()=>void chat.create(lastPathImage!.id,true)}>Начать новую цепочку с этой версии</button>}</div></div>}
        {!isModel&&message.job.status==='cancelled'&&<small className="nano-cancelled">Остановлено</small>}
        </Fragment>
       }),[path,chat.models,blocked,copied,failed?.id,lastPathImage,images,arrivals,onConnection,head,chat.uploads.length]);
 return (<main className="main-panel nano-studio" data-active={active} data-sidebar-collapsed="true"
  onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDragging(true)}}}
  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}}
  onDrop={e=>{e.preventDefault();setDragging(false);void chat.upload(Array.from(e.dataTransfer.files))}}>
  <header className="nano-projectbar" aria-label="Чат Nano Banana">
   <div className="nano-project-title">
    {showMenuButton&&<IconButton label="Главное меню" onClick={onMenu}><PanelLeft size={18}/></IconButton>}
    <div className="nano-heading"><h1 title={chat.view?.session.title}>{chat.view?.session.title||'Новый чат'}</h1>
     <button ref={modelOpener} type="button" className="nano-model-btn" aria-label="Выбрать модель Nano Banana" aria-expanded={modelPicker} disabled={blocked||chat.loading} onClick={()=>setModelPicker(true)}><Sparkles size={14}/><span>{chat.config?.name||'Nano Banana'}</span><ChevronDown size={14}/></button>
    </div>
   </div>
   <div className="nano-projectbar-right">
    <IconButton ref={historyOpener} label="История чатов" title="История чатов (Ctrl K)" onClick={()=>setHistoryDrawer(true)}><History size={18}/></IconButton>
    <IconButton label="Новый чат" disabled={chat.busy||chat.uncertain} onClick={startNew}><Plus size={20}/></IconButton>
    <IconButton ref={settingsOpener} label="Параметры Nano Banana" aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}><SlidersHorizontal size={18}/></IconButton>
    <IconButton label="Вернуться в чат" className="nano-desktop-back" onClick={onChat}><ArrowLeft size={18}/></IconButton>
   </div>
  </header>
  <div className="nano-chat-layout">
   <section className="nano-conversation" aria-label="Переписка Nano Banana">
    <div ref={feed} className="nano-workspace nano-feed"
     onWheelCapture={()=>{followingHead.current=false}}
     onPointerDownCapture={()=>{followingHead.current=false}}
     onTouchMoveCapture={()=>{followingHead.current=false}}
     onKeyDownCapture={()=>{followingHead.current=false}}
     onLoadCapture={()=>{if(followingHead.current)followHead()}}
     onScroll={()=>{const node=feed.current;if(node){if(followingHead.current){stick.current=true;setShowLatest(false);return}stick.current=node.scrollHeight-node.clientHeight-node.scrollTop<70;setShowLatest(!stick.current)}}}>
     <div ref={feedContent} className="nano-inner nano-feed-content">
      {chat.loading?<div className="nano-loading-state" role="status"><span className="nano-progress-dots" aria-hidden="true"><i/><i/><i/></span>Открываю чат…</div>:isWelcome?<div className="nano-welcome-area">
       <div className="nano-welcome-icon"><Sparkles size={28}/></div><h2>Что создадим?</h2><p>Создавай изображения и меняй их в разговоре.<br/>Можно начать с описания или своей картинки.</p>
       <div className="nano-preset-chips">{['Создать иллюстрацию','Изменить фон','Улучшить изображение'].map(text=><button type="button" key={text} onClick={()=>{chat.setDraft(v=>({...v,text}));focus()}}>{text}<ArrowUp size={14}/></button>)}</div>
      </div>:<div className="nano-feed-view">
       {chat.view?.root_job&&!path.some(m=>m.role==='model'&&m.job.id===chat.view?.root_job?.id)&&<div className="nano-root-block"><span className="nano-root-label">Исходное изображение</span><NanoImage part={{type:'image',kind:'image',id:chat.view.root_job.id,index:0}} dimensions={chat.view.root_job} disabled={blocked} onAttach={()=>attach({type:'image',kind:'image',id:chat.view!.root_job!.id,index:0})} onCompare={images.length>1?source=>openCompare({type:'image',kind:'image',id:chat.view!.root_job!.id,index:0},source):undefined}/><button type="button" className="nano-action-chip" disabled={blocked} onClick={()=>void branch(null)}><GitBranch size={14}/>Продолжить с исходника</button></div>}
       <NanoDraftPresence.Provider value={!!chat.draft.text.trim()||!!chat.draft.assets.length}>{transcript}</NanoDraftPresence.Provider>
       {pending&&<article className="nano-message is-model is-streaming" aria-busy="true"><div className="nano-message-name"><Sparkles size={16}/>{chat.config?.name||'Nano Banana'}</div>{preview&&<div className="nano-message-text markdown"><Markdown text={preview}/></div>}<NanoProgress job={chat.view!.active_job!} video={isVideo}/></article>}
      </div>}
     </div>
    </div>
    <section className="nano-compose-area" aria-label="Запрос Nano Banana">
     {showLatest&&<button type="button" className="nano-latest" onClick={followHead}><ArrowDown size={16}/>К последнему сообщению</button>}
     {modelNotice&&<div className="nano-notice" role="status"><span>{modelNotice}</span><IconButton label="Скрыть уведомление" onClick={()=>setModelNotice('')}><X size={14}/></IconButton></div>}
     {chat.connectionError&&<div className="nano-connection nano-notice" role="status"><AlertCircle size={16}/><span>{chat.connectionError}</span><button type="button" onClick={()=>void chat.refresh()}>Обновить</button></div>}
     {chat.error&&<div className="nano-error-banner nano-notice" role="alert"><AlertCircle size={16}/><span>{chat.error}</span><IconButton label="Скрыть ошибку" onClick={chat.dismissError}><X size={16}/></IconButton></div>}
     {chat.uncertain&&<div className="nano-notice"><span>Проверяем, принят ли запрос. Повторная отправка сохранит его идентификатор.</span><button type="button" disabled={chat.busy||pending||branchBlocked} onClick={()=>void chat.send(true)}>Повторить отправку</button></div>}
     {chat.continuation&&<div className="nano-branch-notice nano-notice" role="status"><GitBranch size={16}/>{images.find(image=>chat.view?.messages.find(m=>m.id===chat.continuation?.target)?.content.includes(image.part))&&<PartThumbnail part={images.find(image=>chat.view?.messages.find(m=>m.id===chat.continuation?.target)?.content.includes(image.part))!.part}/>}<span>{chat.continuation.status==='failed'?'Не удалось выбрать продолжение. Отправка приостановлена.':chat.continuation.status==='switching'?'Выбираю продолжение…':'Продолжение от выбранного ответа. Прежняя ветка сохранена.'}</span>{chat.continuation.status==='failed'&&<button type="button" disabled={chat.busy} onClick={()=>void chat.selectHead(chat.continuation!.target)}>Повторить выбор</button>}<button type="button" disabled={chat.busy||pending||chat.uncertain} onClick={()=>void restoreHead()}>Вернуться к прежней ветке</button></div>}
     {!!chat.uploads.length&&<div className="nano-upload-tasks" aria-label="Загрузка вложений">{chat.uploads.map(task=><div className="nano-notice" key={task.id} role={task.status==='failed'?'alert':'status'}>{task.status==='failed'?<AlertCircle size={16}/>:<Loader2 size={16}/>}<span><strong>{task.name}</strong><small>{task.error||'Загружаю изображение…'}</small></span>{task.status==='failed'&&<><button type="button" disabled={chat.busy} onClick={()=>chat.retryUpload(task.id)}>Повторить</button><IconButton label="Убрать неудачное вложение" disabled={chat.busy} onClick={()=>chat.dismissUpload(task.id)}><X size={14}/></IconButton></>}</div>)}</div>}
     <form className="nano-composer nano-capsule" onSubmit={e=>{e.preventDefault();void handleSend()}}>
      {!!chat.draft.assets.length&&<div className="nano-ref-list nano-attachments" aria-label="Прикреплённые изображения">{chat.draft.assets.map(asset=><div key={asset.id} className="nano-ref-chip"><PartThumbnail part={{type:'image',kind:'nano_asset',id:asset.id,index:0}} alt={asset.name||'Референс'}/><span title={asset.name}>{asset.name||'Изображение'}</span><IconButton label="Удалить вложение" disabled={chat.busy} onClick={()=>chat.setDraft(v=>({...v,assets:v.assets.filter(a=>a.id!==asset.id)}))}><X size={14}/></IconButton></div>)}</div>}
      <ChatComposerEditor field={field} callbacks={callbacks} hint={narrow?(isVideo?'Опиши видео…':'Опиши изображение…'):(isVideo?'Опиши видео или изменения…':'Опиши изображение или изменения…')} disabled={chat.loading} welcome={false}/>
      <div className="nano-composer-bottom"><div className="nano-compose-tools"><DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button ref={addOpener} type="button" className="nano-attach-trigger" aria-label="Добавить изображения"><Plus size={18}/><span>Добавить</span></button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="nano-attach-options nano-surface" onCloseAutoFocus={e=>e.preventDefault()}>
         <DropdownMenuItem disabled={chat.busy} onSelect={()=>file.current?.click()}><ImagePlus size={18}/>Загрузить изображение</DropdownMenuItem>
         <DropdownMenuItem disabled={chat.busy} onSelect={()=>setGallery(true)}><Images size={18}/>Прикрепить из галереи</DropdownMenuItem>
        </DropdownMenuContent>
       </DropdownMenu><button type="button" className="nano-settings-summary" onClick={()=>setAdvanced(true)}>{settings.aspect_ratio==='auto'?'Авто':settings.aspect_ratio}<span>·</span>{isVideo?settings.video_resolution:settings.image_size}</button></div>
       {pending?<button type="button" className="nano-primary-btn is-stop" aria-label="Остановить Nano Banana" onClick={()=>void chat.stop()}><Square size={16}/><span>Остановить</span></button>:<button type="submit" className="nano-primary-btn" aria-label="Отправить Nano Banana" disabled={blocked||uploadBlocked||chat.loading||!chat.draft.text.trim()||!chat.config?.available}><ArrowUp size={18}/><span>Отправить</span></button>}
      </div>
     </form>
     <div className="nano-compose-help">{!chat.config?.available?<span>{chat.config?.reason||'Подключи Google AI Studio в настройках'}{onConnection&&<button type="button" className="nano-connect-link" onClick={onConnection}>Открыть подключение</button>}</span>:<span>{settings.response_mode==='image'&&!isVideo?'Режим «Только изображение»':'Следующее сообщение продолжает разговор'}</span>}<span className="nano-shortcut-hint">Ctrl / ⌘ + Enter</span></div>
    </section>
   </section>
   <AnimatePresence initial={false}>{wide&&advanced&&<motion.aside key="settings" className="nano-settings-panel nano-settings-inline nano-surface" aria-labelledby="nano-settings-title" initial={{width:0,opacity:0}} animate={{width:320,opacity:1}} exit={{width:0,opacity:0}} transition={softTransition(reduced||!wide,.24)}>{parameters}</motion.aside>}</AnimatePresence>
  </div>
  <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e=>{void chat.upload(Array.from(e.target.files||[]));e.target.value=''}}/>
  {dragging&&<div className="nano-drop-overlay"><ImagePlus size={40}/><strong>Отпустите изображение для загрузки</strong><p>PNG, JPEG или WebP до 20 МБ</p></div>}
  <Dialog.Root open={!wide&&advanced} onOpenChange={setAdvanced}><Dialog.Portal><Dialog.Overlay className="nano-panel-backdrop"/><NanoPanel open={!wide&&advanced} className="nano-settings-panel nano-settings-overlay nano-surface" onCloseAutoFocus={e=>returnFocus(e,settingsOpener.current)} aria-describedby={undefined}><Dialog.Title className="sr-only">Параметры Nano Banana</Dialog.Title>{parameters}</NanoPanel></Dialog.Portal></Dialog.Root>
  <Dialog.Root open={historyDrawer} onOpenChange={setHistoryDrawer}><Dialog.Portal><Dialog.Overlay className="nano-panel-backdrop"/><NanoPanel open={historyDrawer} className="nano-history-drawer nano-surface" onCloseAutoFocus={e=>returnFocus(e,historyOpener.current)} aria-describedby={undefined} onOpenAutoFocus={e=>{e.preventDefault();searchInput.current?.focus()}} onTouchStart={e=>{historyTouch.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null}} onTouchCancel={()=>{historyTouch.current=null}} onTouchEnd={e=>{const start=historyTouch.current;historyTouch.current=null;if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(dx>60&&dx>Math.abs(dy)*1.2)setHistoryDrawer(false)}}><Dialog.Title className="sr-only">Чаты Nano Banana</Dialog.Title><Dialog.Close asChild><IconButton label="Закрыть историю" className="nano-drawer-close"><X size={18}/></IconButton></Dialog.Close>{historyDrawerContent}</NanoPanel></Dialog.Portal></Dialog.Root>
  <Dialog.Root open={!!comparison} onOpenChange={open=>{if(!open)setComparison(null)}}><Dialog.Portal><Dialog.Overlay className="nano-panel-backdrop"/><NanoPanel open={!!comparison} className="nano-modal-dialog nano-surface" onCloseAutoFocus={e=>returnFocus(e,compareOpener.current)} aria-describedby={undefined}><header><Dialog.Title>Сравнение изображений</Dialog.Title><Dialog.Close asChild><IconButton label="Закрыть сравнение"><X size={18}/></IconButton></Dialog.Close></header><div className="nano-compare-grid">{(['a','b'] as const).map((side,i)=><section key={side}><label>Изображение {i+1}<select aria-label={`Изображение для сравнения ${i+1}`} value={comparison?.[side]||''} onChange={e=>setComparison(v=>v?{...v,[side]:e.target.value}:null)}>{images.map((image,n)=><option key={image.key} value={image.key}>{n+1}. {image.label}</option>)}</select></label><div className="nano-compare-preview">{(side==='a'?compareA:compareB)?<img src={side==='a'?compareA:compareB} alt={`Изображение ${i+1}`}/>:<button type="button" disabled={!(side==='a'?compareFailedA:compareFailedB)} onClick={side==='a'?retryCompareA:retryCompareB}>{(side==='a'?compareFailedA:compareFailedB)?'Повторить загрузку':'Загружаю…'}</button>}</div></section>)}</div></NanoPanel></Dialog.Portal></Dialog.Root>
   {/* Model Picker Dialog */}
   <Dialog.Root open={modelPicker} onOpenChange={setModelPicker}>
    <Dialog.Portal>
     <Dialog.Overlay className="nano-panel-backdrop"/>
     <NanoPanel open={modelPicker} className="nano-model-picker nano-surface" onCloseAutoFocus={e=>returnFocus(e,modelOpener.current)} aria-describedby="nano-model-note">
      <header>
       <Dialog.Title>Выбор модели</Dialog.Title>
       <Dialog.Close asChild><IconButton label="Закрыть выбор модели" onClick={() => setModelPicker(false)}><X size={18}/></IconButton></Dialog.Close>
      </header>

      <div className="nano-model-list" role="group" aria-label="Список моделей">
       {chat.models.map(model => {
        const isCurrent = model.model === (settings.model || chat.config?.model);
        return (
         <button
          key={model.model}
          type="button"
          className="nano-model-item"
          aria-pressed={isCurrent}
          disabled={!model.available || blocked || chat.uncertain}
          onClick={() => { const startsNew = model.model!==settings.model&&Boolean(chat.view?.messages.length); void chat.chooseModel(model).then(ok => { if (ok) { setModelPicker(false); setModelNotice(startsNew ? 'Для выбранной модели открыт новый чат. Черновик и вложения перенесены.' : ''); } }); }}
         >
          <span className="nano-model-icon" aria-hidden="true">
           {model.output_kind === 'video' ? <Video size={18}/> : <ImagePlus size={18}/>}
          </span>
          <div className="nano-model-info">
           <strong>{model.name}</strong>
           <small className="nano-model-meta">
            {model.available
             ? (model.output_kind === 'video'
                ? 'Видео · 360p–4K · 16:9 и 9:16'
                : [model.image_sizes.join(' · '), model.features?.google_search ? 'Поиск Google' : 'Без поиска'].join('  /  '))
             : 'Недоступна в AI Studio'}
           </small>
          </div>
          {isCurrent && <Check size={18} className="nano-model-check" aria-hidden="true"/>}
         </button>
        );
       })}
      </div>
      <Dialog.Description id="nano-model-note" className="nano-model-note">
       {chat.view?.messages.length ? 'Выбор другой модели откроет новый чат. Этот разговор сохранится в истории.' : 'Изображения и видео через подключённый Google AI Studio.'}
      </Dialog.Description>
     </NanoPanel>
    </Dialog.Portal>
   </Dialog.Root>

      {/* Gallery Dialog */}
   <Dialog.Root open={gallery} onOpenChange={setGallery}>
    <Dialog.Portal>
     <Dialog.Overlay className="nano-panel-backdrop"/>
     <NanoPanel open={gallery} ref={galleryPanel} className="nano-gallery nano-surface" onCloseAutoFocus={e=>returnFocus(e,addOpener.current)} tabIndex={-1} aria-describedby="nano-gallery-description" onOpenAutoFocus={e=>{e.preventDefault();galleryPanel.current?.focus({preventScroll:true})}}>
      <header>
       <div className="nano-gallery-header-info">
        <Dialog.Title>Выбрать из галереи</Dialog.Title>
        <Dialog.Description id="nano-gallery-description">Выбери изображение, которое хочешь добавить в запрос</Dialog.Description>
       </div>
       <Dialog.Close asChild><IconButton label="Закрыть галерею" onClick={() => setGallery(false)}><X size={18}/></IconButton></Dialog.Close>
      </header>

      <div className="nano-gallery-toolbar">
      <div className="nano-gallery-search-wrap">
       <Search size={16} className="nano-gallery-search-icon" aria-hidden="true"/>
       <input
        type="search"
        className="nano-gallery-search-input"
        aria-label="Поиск по галерее"
        placeholder="Поиск по описанию"
        value={galleryQuery}
        onChange={e => setGalleryQuery(e.target.value)}
       />
       {galleryQuery && (
        <HintButton
         type="button"
         className="nano-gallery-search-clear"
         aria-label="Очистить поиск"
         onClick={() => setGalleryQuery('')}
        >
         <X size={14}/>
        </HintButton>
       )}
      </div>
      <span className="nano-gallery-count" role="status" aria-live="polite">{galleryLoading?'Поиск…':`Найдено: ${arts.length}`}</span>
      </div>

      {(galleryError||chat.error) && <p className="nano-gallery-error" role="alert">{galleryError||chat.error}</p>}

      <div className="nano-gallery-grid" role="group" aria-label="Изображения галереи" aria-busy={galleryLoading}>
       {galleryLoading && !arts.length ? (
        <div className="nano-gallery-status">
         <Loader2 size={24} className="spin"/>
         <span>Загрузка изображений...</span>
        </div>
       ) : !arts.length ? (
        <div className="nano-gallery-empty">
         <ImageIcon size={32}/>
         <span>{galleryQuery ? 'Ничего не найдено по этому запросу' : 'В галерее пока нет сгенерированных изображений'}</span>
        </div>
       ) : (
        arts.map(art=><NanoGalleryCard key={art.id} art={art} disabled={chat.busy||galleryLoading} onSelect={()=>chat.gallery(art.id).then(ok=>{if(ok)setGallery(false);return ok})}/>)
       )}
      </div>

      <div className="nano-gallery-footer">
       <ImagePlus size={14}/><span>Выбранное изображение появится во вложениях</span>
      </div>
     </NanoPanel>
    </Dialog.Portal>
   </Dialog.Root>

   {/* Rename Dialog */}
   <Dialog.Root open={Boolean(rename)} onOpenChange={open => { if (!open) setRename(null); }}>
    <Dialog.Portal>
     <Dialog.Overlay className="nano-panel-backdrop"/>
     <NanoPanel open={Boolean(rename)} className="nano-small-dialog nano-surface" aria-describedby={undefined}>
      <Dialog.Title>Название чата</Dialog.Title>
      <form onSubmit={e => { e.preventDefault(); if (rename) void chat.rename(rename, renameText).then(ok => { if (ok) setRename(null); }); }}>
       <input aria-label="Название чата Nano Banana" value={renameText} maxLength={120} onChange={e => setRenameText(e.target.value)} autoFocus/>
       <div>
        <Dialog.Close asChild><Button variant="ghost" type="button">Отмена</Button></Dialog.Close>
        <Button type="submit" disabled={!renameText.trim()}>Сохранить</Button>
       </div>
      </form>
     </NanoPanel>
    </Dialog.Portal>
   </Dialog.Root>

   {/* Delete Dialog */}
   <Dialog.Root open={Boolean(confirmDelete)} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
    <Dialog.Portal>
     <Dialog.Overlay className="nano-panel-backdrop"/>
     <NanoPanel open={Boolean(confirmDelete)} className="nano-small-dialog nano-surface">
      <Dialog.Title>Удалить чат?</Dialog.Title>
      <Dialog.Description>Чат исчезнет из истории. Сгенерированные изображения останутся в галерее.</Dialog.Description>
      {chat.error && <p className="nano-error" role="alert">{chat.error}</p>}
      <div>
       <Dialog.Close asChild><Button variant="ghost">Отмена</Button></Dialog.Close>
       <Button disabled={chat.busy} onClick={() => { if (confirmDelete) void chat.remove(confirmDelete).then(ok => { if (ok) { setConfirmDelete(null); setModelNotice(''); } }); }}><Trash2 size={14}/>Удалить</Button>
      </div>
     </NanoPanel>
    </Dialog.Portal>
   </Dialog.Root>
  </main>
 );
}

export function NanoStudio(props:Parameters<typeof NanoStudioContent>[0]){useEffect(()=>()=>nanoMediaCache.clear(props.userId),[props.userId]);return <NanoMediaAccount.Provider value={props.userId}><NanoStudioContent {...props}/></NanoMediaAccount.Provider>}
