import {NativeImage,useNativeMedia} from '../native/media';
import {HintButton} from './Hint';
import {useVideoDraft} from './useVideoDraft';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {accountKey} from '../accountStorage';
import {Select,SelectOption} from './Select';
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {Dialog} from 'radix-ui';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Clapperboard,X,Loader2,Square,Download,Play,Columns2,Trash2,Film,Check,Upload} from '../icons';
import {Button,Disclosure} from './primitives';
import {Reveal} from './Reveal';
import {VideoDownload} from './ArtDownload';
import {api} from '../store';
import {notifyWhenHidden} from '../pwa';
import './ArtAnimator.css';

type Engine='h3'|'dasiwa';
type VideoJob={id:string;source_id:string;engine:string;prompt:string;compiled_prompt?:string;status:string;phase:string;progress:number|null;created:number;width:number;height:number;fps:number;frames:number;seed:number;audio:boolean;duration:number;resolution:string;steps:number;anime:boolean;error?:string};
type EngineInfo={id:Engine;name:string;ready:boolean;missing:{file:string;url:string}[];missing_nodes?:string[];installation?:{status:string;index?:number;files?:number}|null};
type Config={online:boolean;engines:EngineInfo[]};
const terminal=new Set(['done','error','cancelled']);
const names={h3:'DaSiWa H3 Hybrid v4 Turbo · INT4',dasiwa:'DaSiWa SnatchKiss v11 · Q4'};
// Старые ролики LTX остаются в истории с прежней подписью.
const engineName=(id:string)=>names[id as Engine]||(id==='ltx'?'LTX 2.5':'Видео');
const suggestions=['Мягко моргает, волосы слегка колышутся. Камера неподвижна.','Медленно поворачивает голову и улыбается. Камера плавно приближается.','Дождь и огни на фоне движутся. Персонаж сохраняет позу.'];

export const GenerationVideoContext=createContext<((imageId:string)=>void)|null>(null);

export function VideoStudio({imageId='',onClearSource,active=true,onReady}:{imageId?:string;onClearSource?:()=>void;active?:boolean;onReady?:(error?:string)=>void}){return <section className="art-animator art-animator-inline"><header className="art-animator-heading"><div><span>Локальное видео</span><h1>Создать видео</h1></div></header><AnimatorSession imageId={imageId} onClearSource={onClearSource} active={active} onReady={onReady}/></section>}

export function ArtAnimateButton({imageId=''}:{imageId?:string}){
 const openStudio=useContext(GenerationVideoContext);
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(imageId);
 return <><button type="button" className="art-animate-button" aria-label={imageId?'Оживить арт':'Создать видео из своего изображения'} onClick={event=>{event.stopPropagation();if(openStudio){openStudio(imageId);return}setSelected(imageId);setOpen(true)}}><Clapperboard size={16}/><span>{imageId?'Оживить':'Видео'}</span></button>{!openStudio&&<ArtAnimator imageId={selected} open={open} onOpenChange={setOpen}/>}</>;
}

export function ArtAnimator({imageId,open,onOpenChange}:{imageId:string;open:boolean;onOpenChange:(value:boolean)=>void}){
 const dialog=useRef<HTMLDivElement>(null);
 return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="art-animator-backdrop"/><Dialog.Content ref={dialog} className="art-animator" aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();dialog.current?.focus({preventScroll:true})}}><header className="art-animator-heading"><div><span>Локальное видео</span><Dialog.Title>Оживить арт</Dialog.Title></div><Dialog.Close className="art-animator-close" aria-label="Закрыть генерацию видео"><X size={18}/></Dialog.Close></header><AnimatorSession key={imageId} imageId={imageId} active={open}/></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

type VideoView={tab?:'create'|'history';historyView?:string|null;selected?:string|null;comparison?:string[];compare?:boolean;parameters?:boolean;scroll?:Record<string,number>;playback?:Record<string,number>};
function readVideoView():VideoView{try{const saved=JSON.parse(localStorage.getItem(accountKey('art-video-view'))||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}}catch{return {}}}

/** Only an explicit viewing request starts playback. Hidden media pauses and
 * stays paused when it returns; saved history restores its position, not play. */
function HistoryVideo({job,active,playRequest,onRequestHandled,register,onRestore,onSave}:{job:VideoJob;active:boolean;playRequest:number;onRequestHandled:()=>void;register:(node:HTMLVideoElement|null)=>void;onRestore:(video:HTMLVideoElement,id:string)=>void;onSave:(video:HTMLVideoElement,id:string)=>void}){
 const nativeVideo=useNativeMedia(`/api/videos/${job.id}/file`,active),nativePoster=useNativeMedia(`/api/videos/${job.id}/poster`);
 const video=useRef<HTMLVideoElement|null>(null),inView=useRef(true),metadataReady=useRef(false),reduced=useReducedMotion();
 const callbacks=useRef({onRequestHandled,onRestore,onSave});callbacks.current={onRequestHandled,onRestore,onSave};
 // Visibility can report a paused first frame before loadedmetadata arrives.
 // Do not overwrite a saved position with that initial zero before restoring it.
 const save=(element:HTMLVideoElement)=>{if(metadataReady.current)callbacks.current.onSave(element,job.id)};
 useLayoutEffect(()=>{if(!active||reduced)video.current?.pause()},[active,reduced]);
 useLayoutEffect(()=>{
  if(!playRequest)return;
  callbacks.current.onRequestHandled();
  if(active&&!document.hidden)void video.current?.play().catch(()=>{});
 },[playRequest,active]);
 useEffect(()=>{
  const element=video.current;if(!element)return;
  const pause=()=>{element.pause();save(element)};
  const visibility=()=>{if(document.hidden)pause()};
  const observer=new IntersectionObserver(entries=>{inView.current=!!entries[0]?.isIntersecting;if(!inView.current)pause()});observer.observe(element);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pause);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pause);element.pause()};
 },[job.id]);
 return <video ref={node=>{video.current=node;register(node)}}
  onLoadedMetadata={event=>{callbacks.current.onRestore(event.currentTarget,job.id);metadataReady.current=true}}
  onTimeUpdate={event=>save(event.currentTarget)}
  onSeeked={event=>save(event.currentTarget)}
  onPause={event=>save(event.currentTarget)}
  onPlay={event=>{if(!active||document.hidden||!inView.current)event.currentTarget.pause()}}
  src={nativeVideo} poster={nativePoster} controls playsInline preload="metadata" loop={!reduced}/>;
}

function AnimatorSession({imageId,onClearSource,active=true,onReady}:{imageId:string;onClearSource?:()=>void;active?:boolean;onReady?:(error?:string)=>void}){
 const [initialView]=useState(readVideoView);
 const savedView=useRef(initialView),scrollPositions=useRef<Record<string,number>>({...savedView.current.scroll}),playbackPositions=useRef<Record<string,number>>({...savedView.current.playback}),restoringScroll=useRef(false);
 const [parametersOpen,setParametersOpen]=useState(savedView.current.parameters===true);
 const {values:draft,edit:editDraft,ready:draftLoaded,syncError,loadFailureRevision}=useVideoDraft(String(window.storageManager.currentUser?.id||''));
 const {engine,prompt,duration,resolution,steps,seed,anime,audio,translate,sourceId}=draft;
 const setEngine=(value:Engine)=>editDraft({engine:value}),setPrompt=(value:string)=>editDraft({prompt:value}),setDuration=(value:number)=>editDraft({duration:value}),setResolution=(value:string)=>editDraft({resolution:value}),setSteps=(value:number)=>editDraft({steps:value}),setSeed=(value:string)=>editDraft({seed:value}),setAnime=(value:boolean)=>editDraft({anime:value}),setAudio=(value:boolean)=>editDraft({audio:value}),setTranslate=(value:boolean)=>editDraft({translate:value}),setSourceId=(value:string)=>editDraft({sourceId:value});
 const reduced=useReducedMotion(),[config,setConfig]=useSnapshotState<Config|null>(null);
 const [jobs,setJobs]=useSnapshotState<VideoJob[]>([]),[selected,setSelected]=useState<string|null>(null),[comparison,setComparison]=useState<string[]>([]),[compare,setCompare]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[connectionError,setConnectionError]=useState(''),[tab,setTab]=useState<'create'|'history'>(savedView.current.tab==='history'?'history':'create');
 const [historyView,setHistoryView]=useState<string|null>(null);
 const [playRequest,setPlayRequest]=useState<{id:string;token:number}|null>(null),playSequence=useRef(0);
 const [initialReady,setInitialReady]=useState(false),[failureRevision,setFailureRevision]=useState(0),failedActivation=useRef(false),draftFailure=useRef(loadFailureRevision),readyCallback=useRef(onReady);readyCallback.current=onReady;
 useLayoutEffect(()=>{failedActivation.current=false;draftFailure.current=loadFailureRevision},[active]);
 useLayoutEffect(()=>{if(!active)return;if(!draftLoaded){if(syncError&&loadFailureRevision!==draftFailure.current)readyCallback.current?.(syncError);return}if(initialReady)readyCallback.current?.();else if(failedActivation.current&&connectionError)readyCallback.current?.(connectionError)},[active,draftLoaded,initialReady,connectionError,failureRevision,syncError,loadFailureRevision]);
 const [historyWorking,setHistoryWorking]=useState(false),[removedIds,setRemovedIds]=useState<string[]>([]);
 const historyOperation=useRef(false),hiddenJobs=useRef(new Set<string>()),historyRevision=useRef(0);
 const historyTrigger=useRef<HTMLButtonElement|null>(null),historyScroll=useRef(0);
 const [uploading,setUploading]=useState(false),[dragging,setDragging]=useState(false);
 const sourceProp=useRef('');
 useEffect(()=>{if(!imageId){sourceProp.current='';return}if(draftLoaded&&imageId!==sourceProp.current){sourceProp.current=imageId;setSourceId(imageId);setSelected(null);setCompare(false);setTab('create')}},[imageId,draftLoaded]);
 const uploadInput=useRef<HTMLInputElement>(null),uploadRequest=useRef<AbortController|null>(null);
 const videos=useRef<(HTMLVideoElement|null)[]>([]),body=useRef<HTMLDivElement>(null),alive=useRef(true);
 // Tab exits retain their old JSX for the fade; pause from the live session
 // as well, before an outgoing player's props or DOM have been released.
 useLayoutEffect(()=>{if(!active||tab!=='history'){setPlayRequest(null);videos.current.forEach(video=>video?.pause())}},[active,tab]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;uploadRequest.current?.abort()}},[]);
 useEffect(()=>{if(!draftLoaded)return;const view=savedView.current;if(view.tab==='history')setTab('history');if(typeof view.historyView==='string')setHistoryView(view.historyView);if(typeof view.selected==='string')setSelected(view.selected);if(Array.isArray(view.comparison))setComparison(view.comparison.filter(id=>typeof id==='string').slice(0,2));setCompare(view.compare===true)},[draftLoaded]);
 const viewSnapshot=useRef<VideoView>({}),saveViewTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 viewSnapshot.current={tab,historyView,selected,comparison,compare,parameters:parametersOpen};
 const saveView=()=>{clearTimeout(saveViewTimer.current);if(!draftLoaded)return;try{localStorage.setItem(accountKey('art-video-view'),JSON.stringify({...viewSnapshot.current,scroll:scrollPositions.current,playback:playbackPositions.current}))}catch{}};
 const scheduleView=()=>{clearTimeout(saveViewTimer.current);saveViewTimer.current=setTimeout(saveView,120)};
 useEffect(()=>{saveView()},[draftLoaded,tab,historyView,selected,comparison,compare,parametersOpen]);
 useEffect(()=>{if(!draftLoaded)return;window.addEventListener('pagehide',saveView);return()=>{window.removeEventListener('pagehide',saveView);saveView()}},[draftLoaded]);
 useLayoutEffect(()=>{
  const element=body.current;if(!element)return;
  const saved=scrollPositions.current[tab],target=typeof saved==='number'&&Number.isFinite(saved)?Math.max(0,saved):0;
  restoringScroll.current=target>0;
  const restore=()=>{if(!restoringScroll.current)return;element.scrollTop=target;if(Math.abs(element.scrollTop-target)<1)restoringScroll.current=false};
  const resize=new ResizeObserver(restore);resize.observe(element);
  const children=()=>{resize.disconnect();resize.observe(element);if(element.firstElementChild)resize.observe(element.firstElementChild);restore()};
  const mutations=new MutationObserver(children);mutations.observe(element,{childList:true});children();
  return()=>{resize.disconnect();mutations.disconnect()};
 },[tab,draftLoaded]);
 const restorePlayback=(video:HTMLVideoElement,id:string)=>{const time=playbackPositions.current[id];if(typeof time==='number'&&Number.isFinite(time)&&time>0&&Number.isFinite(video.duration))video.currentTime=Math.min(time,Math.max(0,video.duration-.1))};
 const savePlayback=(video:HTMLVideoElement,id:string)=>{if(video.readyState===0)return;const time=video.currentTime;if(Number.isFinite(time)){playbackPositions.current[id]=time;const ids=Object.keys(playbackPositions.current);if(ids.length>30)delete playbackPositions.current[ids[0]];scheduleView()}};
 useEffect(()=>{if(!draftLoaded)return;if(engine==='h3'&&duration<5)setDuration(5);if(steps!==4)setSteps(4)},[engine,duration,steps,draftLoaded]);
 useEffect(()=>{if(config?.engines.find(item=>item.id===engine)?.installation?.status==='removed')setEngine('h3')},[config,engine]);
 useEffect(()=>{
  if(!active)return;
  let running=false,alive=true;
  const activeIds=new Set<string>();
  const refresh=async()=>{if(running)return;running=true;const revision=historyRevision.current;try{const [state,history]=await Promise.all([api('/api/videos/config'),api('/api/videos')]);if(alive){setConfig(state);if(revision===historyRevision.current){const list:VideoJob[]=history.jobs.filter((job:VideoJob)=>!hiddenJobs.current.has(job.id));list.forEach(job=>{if(!terminal.has(job.status))activeIds.add(job.id);else if(activeIds.delete(job.id)&&job.status==='done')notifyWhenHidden('LLM Chat','Генерация видео завершена',`video-${job.id}`)});setJobs(list)}setConnectionError('');setInitialReady(true)}}catch(e){if(alive){failedActivation.current=true;setConnectionError(e instanceof Error?e.message:String(e));setFailureRevision(value=>value+1)}}finally{running=false}};
  const receive=()=>{void refresh()};window.addEventListener('video-jobs-updated',receive);const stopPolling=pollVisible(refresh,2500);return()=>{alive=false;stopPolling();window.removeEventListener('video-jobs-updated',receive)};
 },[active]);
 const pending=jobs.find(job=>!terminal.has(job.status)),viewed=jobs.find(job=>job.id===selected),finished=jobs.filter(job=>job.status==='done');
 useEffect(()=>{if(pending&&tab==='create'&&selected!==pending.id)setSelected(pending.id)},[pending?.id,selected,tab]);
 const chosen=config?.engines.find(item=>item.id===engine),canGenerate=draftLoaded&&!!sourceId&&!uploading&&!!chosen?.ready&&!!prompt.trim()&&!pending&&!busy&&Number.isSafeInteger(Number(seed))&&seed!==''&&Number(seed)>=-1&&Number(seed)<=9007199254740991;
 const blocker=!draftLoaded?'':uploading?'Загружаю арт…':!sourceId?'Сначала загрузи арт':!prompt.trim()?'Опиши, что должно произойти в кадре':config&&!config.online?'Запусти ComfyUI':config&&!chosen?.ready?'Модель пока не готова':'';
 const clearSource=()=>{if(!draftLoaded||uploading||pending||busy)return;setSourceId('');setSelected(null);setCompare(false);setDragging(false);setError('');onClearSource?.()};
 const sourceUrl=(id:string)=>id.startsWith('upload-')?`/api/videos/sources/${id}/image`:`/api/images/${id}/image/0`;
 const upload=async(file:File)=>{
  if(uploading||pending||busy)return;
  if(file.size>20*1024*1024){setError('Изображение должно быть не больше 20 МБ');return}
  const controller=new AbortController();uploadRequest.current=controller;setUploading(true);setError('');setDragging(false);
  try{
   const response=await fetch('/api/videos/sources',{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':file.type||'application/octet-stream'},body:file,signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Не удалось загрузить арт');
   if(alive.current){setSourceId(data.source.id);setSelected(null);setCompare(false);setTab('create')}
  }catch(e){if(alive.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}
  finally{if(alive.current)setUploading(false);uploadRequest.current=null}
 };
 const playBoth=()=>{const play=videos.current[0]?.paused;videos.current.forEach(video=>{if(video){video.currentTime=0;if(play)void video.play().catch(()=>{});else video.pause()}})};
 const generate=async()=>{
  (document.activeElement as HTMLElement)?.blur();setBusy(true);setError('');setCompare(false);
  try{const {job}=await api('/api/videos','POST',{source_id:sourceId,engine,prompt,duration,resolution,steps:4,seed:Number(seed),anime,audio:engine==='dasiwa'?false:audio,translate,language_model:'gemma-4-e2b-translation'});if(alive.current){setJobs(value=>[job,...value]);setSelected(job.id);setTab('create');body.current?.scrollTo({top:0,behavior:reduced?'instant':'smooth'})}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}
 };
 const stop=async()=>{if(!pending)return;setBusy(true);try{await api(`/api/videos/${pending.id}/stop`,'POST');const data=await api('/api/videos');if(alive.current)setJobs(data.jobs)}catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}finally{if(alive.current)setBusy(false)}};
 const remove=async(job?:VideoJob)=>{
  if(historyOperation.current)return;historyOperation.current=true;setHistoryWorking(true);setError('');
  try{
   const ids:string[]=job?(await api(`/api/videos/${encodeURIComponent(job.id)}`,'DELETE'),[job.id]):(await api('/api/videos/history','DELETE')).ids;
   if(!alive.current)return;
   historyRevision.current++;ids.forEach(id=>hiddenJobs.current.add(id));const removed=new Set(ids);
   setJobs(value=>value.filter(item=>!removed.has(item.id)));setComparison(value=>value.filter(id=>!removed.has(id)));
   setHistoryView(value=>value&&removed.has(value)?null:value);setSelected(value=>value&&removed.has(value)?null:value);setCompare(false);setRemovedIds(ids);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}
  finally{historyOperation.current=false;if(alive.current)setHistoryWorking(false)}
 };
 const restoreHistory=async()=>{
  if(historyOperation.current||!removedIds.length)return;historyOperation.current=true;setHistoryWorking(true);setError('');
  const restored:string[]=[];
  try{
   // Bound parallel requests when restoring an entire history.
   for(let offset=0;offset<removedIds.length;offset+=4){
    if(!alive.current)return;const ids=removedIds.slice(offset,offset+4);
    const results=await Promise.allSettled(ids.map(id=>api(`/api/videos/${encodeURIComponent(id)}/restore`,'POST')));
    results.forEach((result,index)=>{if(result.status==='fulfilled')restored.push(ids[index])});
   }
   if(!alive.current)return;
   historyRevision.current++;restored.forEach(id=>hiddenJobs.current.delete(id));
   setRemovedIds(ids=>ids.filter(id=>!restored.includes(id)));
   if(restored.length!==removedIds.length)setError('Не все ролики удалось вернуть. Нажми «Вернуть», чтобы повторить.');
   const data=await api('/api/videos');if(alive.current)setJobs(data.jobs.filter((job:VideoJob)=>!hiddenJobs.current.has(job.id)));
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:String(e))}
  finally{historyOperation.current=false;if(alive.current)setHistoryWorking(false)}
 };
 const choose=(job:VideoJob,button:HTMLButtonElement)=>{
  historyTrigger.current=button;historyScroll.current=body.current?.scrollTop||0;
  // Mount and call play inside the original click stack, preserving Safari's
  // media user activation even when the selected player did not exist yet.
  flushSync(()=>{setPlayRequest({id:job.id,token:++playSequence.current});setHistoryView(job.id);setCompare(false)});
  body.current?.scrollTo({top:0,behavior:reduced?'instant':'smooth'});
 };
 const closeHistory=()=>{setHistoryView(null);setCompare(false);historyTrigger.current?.focus({preventScroll:true});body.current?.scrollTo({top:historyScroll.current,behavior:'instant'})};
 const historyResult=(compare?comparison:[historyView]).map(id=>jobs.find(job=>job.id===id&&job.status==='done')).filter((job):job is VideoJob=>!!job);
 return <>{syncError&&<p className="art-animator-error" role="status">{syncError}</p>}<nav className="art-animator-tabs"><button type="button" aria-pressed={tab==='create'} onClick={()=>setTab('create')}>Создание</button><button type="button" aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Мои ролики{finished.length>0&&<span>{finished.length}</span>}</button></nav><div ref={body} className="art-animator-body" onWheel={()=>{restoringScroll.current=false}} onTouchStart={()=>{restoringScroll.current=false}} onPointerDown={()=>{restoringScroll.current=false}} onKeyDown={()=>{restoringScroll.current=false}} onScroll={event=>{if(!restoringScroll.current){scrollPositions.current[tab]=event.currentTarget.scrollTop;scheduleView()}}}>
 <AnimatePresence mode="wait" initial={false}>{tab==='create'?<motion.div key="create" className="art-animator-create" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:reduced?0:.2}}>
  <div className={`art-animator-stage ${dragging?'is-dragging':''}`} onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();if(!pending&&!busy&&!uploading)setDragging(true)}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false)}} onDrop={event=>{event.preventDefault();setDragging(false);const file=event.dataTransfer.files[0];if(file)void upload(file)}}><AnimatePresence mode="wait" initial={false}><motion.div key="source" className="art-animator-source" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>{(pending?.source_id||sourceId)?<img key={pending?.source_id||sourceId} src={sourceUrl(pending?.source_id||sourceId)} alt="Арт для оживления" draggable={false}/>:<button type="button" className="art-video-upload-empty" disabled={uploading} onClick={()=>uploadInput.current?.click()}><Upload size={32}/><strong>{uploading?'Загружаю арт…':'Загрузи свой арт'}</strong><span>Выбери файл или перетащи его сюда</span><small>PNG, JPG, WebP · до 20 МБ</small></button>}{(pending||sourceId)&&<div className="art-animator-source-caption"><Film size={16}/>{pending?pending.phase:'Начало твоего ролика'}</div>}</motion.div></AnimatePresence>
   {pending&&<div className="art-animator-progress" role="status"><div><Loader2 size={16} className="spin"/><span>{pending.phase}</span>{pending.progress!=null&&<strong>{pending.progress}%</strong>}</div><div className={`art-animator-track ${pending.progress==null?'is-indeterminate':''}`}><i style={pending.progress!=null?{transform:`scaleX(${Math.max(0,Math.min(100,pending.progress))/100})`}:undefined}/></div><small>{engineName(pending.engine)} · можно закрыть окно</small></div>}
  </div><div className="art-animator-controls"><input ref={uploadInput} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Загрузить исходный арт" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file)}}/>{sourceId&&<div className="art-video-source-actions"><Button type="button" variant="outline" className="art-video-upload-button" disabled={uploading||busy||!!pending} onClick={()=>uploadInput.current?.click()}>{uploading?<Loader2 size={16} className="spin"/>:<Upload size={16}/>}<span>{uploading?'Загружаю арт…':sourceId?'Заменить арт':'Загрузить свой арт'}</span></Button>{sourceId&&<Button type="button" variant="ghost" className="art-video-clear-source" disabled={!draftLoaded||uploading||busy||!!pending} onClick={clearSource}><X size={16}/><span>Убрать фото</span></Button>}</div>}{config&&!config.online&&<p className="art-animator-note art-animator-offline" role="status">ComfyUI не запущен. Запусти его, чтобы создавать видео.</p>}<div className="art-animator-engines" role="group" aria-label="Модель видео">{(['h3','dasiwa'] as const).filter(id=>id==='h3'||!!config?.engines.some(item=>item.id===id&&item.installation?.status!=='removed')).map(id=>{const info=config?.engines.find(item=>item.id===id),[title,quant]=names[id].split(' · '),state=!config?'checking':!config.online?'offline':info?.ready?'ready':info?.installation?.status==='downloading'?'loading':'missing',label={checking:'Проверка…',offline:'',ready:'Готова',loading:'Скачивается',missing:'Нужны веса'}[state];return <button key={id} type="button" aria-pressed={engine===id} disabled={busy||!!pending} onClick={()=>setEngine(id)}><Film size={16}/><span className="art-animator-engine-text"><strong>{title}</strong><small><i className={`art-engine-dot is-${state}`} aria-hidden="true"/>{[quant,label].filter(Boolean).join(' · ')}</small></span>{engine===id&&<Check size={14}/>}</button>})}</div>
   <label>Движение и камера<textarea value={prompt} maxLength={6000} rows={4} placeholder="Что должно произойти в кадре? Можно по-русски…" disabled={busy||!!pending} onChange={event=>setPrompt(event.target.value)}/></label>
   <div className="art-animator-suggestions">{suggestions.map((text,index)=><button key={index} disabled={busy||!!pending} type="button" onClick={()=>setPrompt(text)}>{['Спокойный портрет','Поворот и улыбка','Живой фон'][index]}</button>)}</div>
   <div className="art-animator-fields"><label>Длительность<Select value={duration} disabled={busy||!!pending} onChange={event=>setDuration(Number(event.target.value))}>{engine!=='h3'&&<SelectOption value={3}>3 секунды</SelectOption>}<SelectOption value={5}>5 секунд</SelectOption><SelectOption value={8}>8 секунд</SelectOption></Select></label><label>Размер<Select value={resolution} disabled={busy||!!pending} onChange={event=>setResolution(event.target.value)}><SelectOption value="preview">Предпросмотр</SelectOption><SelectOption value="quality">Высокое качество</SelectOption></Select></label></div>
   <div className="art-animator-toggles"><label><input type="checkbox" checked={anime} disabled={busy||!!pending} onChange={event=>setAnime(event.target.checked)}/>Сохранить аниме-стиль</label>{engine!=='dasiwa'&&<label><input type="checkbox" checked={audio} disabled={busy||!!pending} onChange={event=>setAudio(event.target.checked)}/>Создать звук</label>}</div>
   <Disclosure title="Параметры" initial={parametersOpen} onOpenChange={setParametersOpen}><div className="art-animator-fields">{engine==='h3'?<small className="art-animator-schedule">4 шага · CFG 1 · 24 FPS<br/>Euler / simple · shift 8 / 4</small>:<small className="art-animator-schedule">4 шага · CFG 1 · 16 FPS<br/>Euler / linear_quadratic · shift 5</small>}<label>Seed<input type="number" min={-1} max={9007199254740991} value={seed} disabled={busy||!!pending} onChange={event=>setSeed(event.target.value)}/></label></div><label className="art-animator-translation"><input type="checkbox" checked={translate} disabled={busy||!!pending} onChange={event=>setTranslate(event.target.checked)}/>Переводить через Gemma 4 E2B · без цензуры</label></Disclosure>
   {chosen&&!chosen.ready&&config?.online&&<Disclosure title="Подготовка модели"><p className="art-animator-note">{chosen.installation?.status==='downloading'?`Скачиваю файл ${(chosen.installation.index||0)+1} из ${chosen.installation.files||1}. Генерация станет доступна после установки.`:chosen.installation?.status==='done'?'Веса скачаны. Осталось перезапустить ComfyUI.':'Веса ещё не установлены. Генерация станет доступна после загрузки.'}</p>{chosen.missing.map(item=><a className="art-animator-model-link" key={item.file} href={item.url} target="_blank" rel="noreferrer">{item.file}</a>)}{!!chosen.missing_nodes?.length&&<p className="art-animator-note">Нужно обновить ComfyUI: {chosen.missing_nodes.join(', ')}</p>}</Disclosure>}

  </div></motion.div>:<motion.div key="history" className="art-animator-history" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:reduced?0:.2}}>
  <div className="art-animator-history-heading"><span>{comparison.length?'Выбрано '+comparison.length+' из 2':'Выбери два ролика для сравнения'}</span><div className="art-animator-history-controls"><Button type="button" variant="outline" disabled={historyWorking||comparison.length!==2} onClick={()=>{historyScroll.current=body.current?.scrollTop||0;setCompare(true);body.current?.scrollTo({top:0})}}><Columns2 size={14}/>Сравнить</Button><Button type="button" variant="ghost" disabled={historyWorking||!jobs.some(job=>terminal.has(job.status))} onClick={()=>void remove()}><Trash2 size={14}/>Очистить историю</Button></div></div>
  <Reveal show={!!removedIds.length}><div className="art-animator-history-undo" role="status"><span>Удалено роликов: {removedIds.length}</span><Button type="button" variant="ghost" disabled={historyWorking} onClick={()=>void restoreHistory()}>Вернуть</Button></div></Reveal>
  {historyResult.length>0&&<section className="art-animator-history-player" aria-label="Просмотр ролика"><header><strong>{compare?'Сравнение роликов':'Просмотр ролика'}</strong><HintButton type="button" className="icon-button" aria-label="Закрыть просмотр" onClick={closeHistory}><X size={18}/></HintButton></header><div className={`art-animator-results ${compare?'is-comparing':''}`}>{historyResult.map((job,index)=><div key={job.id}><HistoryVideo job={job} active={active&&tab==='history'} playRequest={!compare&&playRequest?.id===job.id?playRequest.token:0} onRequestHandled={()=>setPlayRequest(null)} register={node=>{videos.current[index]=node}} onRestore={restorePlayback} onSave={savePlayback}/><div><span>{job.width} × {job.height} · {job.fps} FPS</span><VideoDownload jobId={job.id}/></div><p className="art-animator-history-prompt">{job.prompt}</p></div>)}{compare&&<Button variant="outline" onClick={playBoth}><Play size={14}/>Смотреть вместе</Button>}</div></section>}
  {!jobs.length&&<div className="art-animator-empty"><Film size={32}/><p>Здесь будут твои ролики</p><small>Они сохранятся, даже если закрыть окно</small></div>}
  <div className="art-animator-grid">{jobs.map(job=><div key={job.id} className="art-animator-card"><button className="art-animator-card-preview" type="button" disabled={job.status!=='done'} aria-label="Смотреть ролик" onClick={event=>choose(job,event.currentTarget)}><NativeImage src={`/api/videos/${job.id}/poster`} alt="Первый кадр ролика" loading="lazy"/><span>{job.status==='done'?<Play size={24}/>:!terminal.has(job.status)?<Loader2 size={24} className="spin"/>:<Film size={24}/>}</span></button><div><strong>{engineName(job.engine)}</strong><small>{job.status==='done'?`${job.width} × ${job.height} · ${(job.frames/job.fps).toFixed(1)} с`:job.phase}</small><p >{job.prompt}</p></div><footer>{job.status==='done'&&<label><input type="checkbox" checked={comparison.includes(job.id)} disabled={!comparison.includes(job.id)&&comparison.length===2} onChange={event=>setComparison(value=>event.target.checked?[...value,job.id]:value.filter(id=>id!==job.id))}/>Сравнить</label>}{terminal.has(job.status)&&<button type="button" aria-label="Удалить ролик из истории" disabled={historyWorking} onClick={()=>void remove(job)}><Trash2 size={14}/><span>Удалить</span></button>}</footer>{job.error&&<p className="art-animator-error">{job.error}</p>}</div>)}</div>
 </motion.div>}</AnimatePresence>
 {(error||connectionError||viewed?.error)&&<p className="art-animator-error" role="alert">{error||connectionError||viewed?.error}</p>}
 </div><footer className="art-animator-actions"><small className={tab==='create'&&!pending&&!canGenerate&&blocker?'is-blocked':undefined}>{tab==='history'?'Выбери ролик для просмотра или сравнения':pending?'Генерация продолжится после закрытия окна':!canGenerate&&blocker?blocker:'Исходный арт сохранится · видео появится в «Мои ролики»'}</small>{pending?<Button variant="outline" disabled={busy} onClick={()=>void stop()}><Square size={14}/>Остановить</Button>:tab==='create'&&<Button disabled={!canGenerate} onClick={()=>void generate()}>{busy?<Loader2 size={16} className="spin"/>:<Clapperboard size={16}/>}Оживить</Button>}</footer></>;
}
