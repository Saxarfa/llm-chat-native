import {afterSurfaceMotion} from '../surfaceCompletion';
import {usePreparedPage} from '../usePreparedPage';
import {useImageSettingsImport} from './ImageSettingsImport';
import {StudioCosmos} from './StudioCosmos';
import {pollVisible} from '../visiblePolling';
import {useSnapshotState} from '../useSnapshotState';
import {defaultImageLoras} from '../imageLoras';
import {LoraControls} from './LoraControls';
import {PromptTranslation} from './PromptTranslation';
import './studioHints.css';
import {Hint,HintButton} from './Hint';
import {Select,SelectOption} from './Select';
import {ImageResolutionOption,imageResolutionDisplay} from './ImageResolutionOption';
import {ImageModelOptions,imageModelName,imageModelAlignment} from './imageModels';
import {Reveal} from './Reveal';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {fadeTransition,motionDuration} from '../motion';
import {StateTransition} from './StateTransition';
import {StudioProgress} from './StudioProgress';
import {StudioHistory} from './StudioHistory';
import {StudioFilmstrip} from './StudioFilmstrip';
import {StudioArtMetadata} from './StudioArtMetadata';
import {ArtComparison} from './ArtComparison';
import {ArtFavoriteButton} from './ArtFavoriteButton';
import {MobileImageStudio} from './MobileImageStudio';
import type {StudioJob as Job,StudioFrame as Frame,StudioConfig} from './studioTypes';
import {ImagePlus,Image as ImageIcon,Clapperboard,Loader2,PanelLeft,ArrowLeft,Square,Repeat,Trash2,X,RotateCcw,ZoomIn,ZoomOut,Scan,PanelsTopLeft,MoreHorizontal} from '../icons';
import {Button,IconButton,Disclosure,Modal} from './primitives';
import {api} from '../store';
import {useImageDraft,type ImageDraft} from './useImageDraft';
import {StudioRecipes} from './StudioRecipes';
import {useStudioWorkspace} from './useStudioWorkspace';
import {ArtViewer} from './ArtViewer';
import {ArtDownload} from './ArtDownload';
import {ArtAnimateButton,GenerationVideoContext,VideoStudio} from './ArtAnimator';
import {SelectionHighlight} from './SelectionHighlight';
import './GenerationStudio.css';
import {ArtUpscaleButton} from './ArtUpscaler';
import {QuickTranslator as QuickTranslatorBlock} from './QuickTranslator';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from './ui/dropdown-menu';
import './StudioPolish.css';
import {accountKey} from '../accountStorage';
import {fitArtRect} from './artViewerGeometry';
import {notifyWhenHidden} from '../pwa';

const labels:Record<string,string>={queued:'Ожидание видеопамяти',preparing:'Освобождаю память LLM',generating:'Генерация',done:'Готово',error:'Ошибка',cancelled:'Остановлено'};
type StudioProps={onMenu:()=>void;onChat:()=>void;userId:string;showMenuButton:boolean;onConnection?:()=>void;active?:boolean;onReady?:(error?:string)=>void};
export function ImageStudio(props:StudioProps){
 const [initialMode]=useState<'images'|'video'>(()=>{try{const key=accountKey('generation-studio-mode'),saved=sessionStorage.getItem(key)??localStorage.getItem(key);return saved==='video'?'video':'images'}catch{return 'images'}});
 const {page:mode,pending,request,ready:modeReady,cancel:cancelMode}=usePreparedPage(initialMode);
 const preparing=pending?.status==='loading'?pending.target:undefined;
 useEffect(()=>{if(props.active===false)cancelMode()},[props.active,cancelMode]);
 const [videoOpened,setVideoOpened]=useState(()=>mode==='video'),[videoSource,setVideoSource]=useState('');
 const [imagesOpened,setImagesOpened]=useState(()=>mode==='images');
 useEffect(()=>{try{sessionStorage.setItem(accountKey('generation-studio-mode'),mode)}catch{}},[mode]);
 const tabs=useRef<HTMLElement>(null);
 const choose=(next:'images'|'video')=>{void request(next);if(next==='video')setVideoOpened(true);if(next==='images')setImagesOpened(true)};
 const admitted=(target:'images'|'video',error?:string)=>{if(pending?.status==='loading'&&pending.target===target)modeReady(pending.id,error);else if(mode===target)props.onReady?.(error)};
 const openVideo=(id:string)=>{setVideoSource(id);choose('video')};
 return <GenerationVideoContext.Provider value={openVideo}><div className={`generation-studio-shell ${props.showMenuButton?'has-menu-trigger':''}`}>
  <nav ref={tabs} className="generation-studio-tabs" role="tablist" aria-label="Тип генерации" onKeyDown={event=>{
   const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();
   const next=event.key==='Home'?'images':event.key==='End'?'video':mode==='images'?'video':'images';choose(next);tabs.current?.querySelector<HTMLButtonElement>(`[data-mode=${next}]`)?.focus();
  }}>
   {([['images','Изображения'],['video','Видео']] as const).map(([id,label])=><button key={id} type="button" role="tab" id={`generation-tab-${id}`} data-mode={id} aria-label={label} aria-selected={mode===id} aria-busy={preparing===id} aria-controls={`generation-panel-${id}`} tabIndex={mode===id?0:-1} onClick={()=>choose(id)}>{id==='images'?<ImageIcon className="generation-tab-icon" size={16} aria-hidden="true"/>:<Clapperboard className="generation-tab-icon" size={16} aria-hidden="true"/>}{id==='images'?<><span className="generation-tab-full">{label}</span><span className="generation-tab-short" aria-hidden="true">Арты</span></>:<span className="generation-tab-text">{label}</span>}</button>)}
   <SelectionHighlight container={tabs} activeKey={mode} className="generation-tab-highlight"/>
  </nav>
  <div className="generation-studio-pane" id="generation-panel-images" role="tabpanel" aria-labelledby="generation-tab-images" hidden={mode!=='images'&&preparing!=='images'} inert={mode!=='images'} data-preparing={mode!=='images'&&preparing==='images'}>{imagesOpened&&<ImageWorkspace {...props} workspaceActive={props.active!==false&&(mode==='images'||preparing==='images')} onReady={error=>admitted('images',error)}/>}</div>
  <div className="generation-studio-pane" id="generation-panel-video" role="tabpanel" aria-labelledby="generation-tab-video" hidden={mode!=='video'&&preparing!=='video'} inert={mode!=='video'} data-preparing={mode!=='video'&&preparing==='video'}>{videoOpened&&<main className="main-panel image-studio video-studio"><StudioCosmos/><header className="chat-header"><div>{props.showMenuButton&&<IconButton data-sidebar-preview-trigger label="Открыть меню" onClick={props.onMenu}><PanelLeft size={18}/></IconButton>}</div><IconButton label="Вернуться в чат" onClick={props.onChat}><ArrowLeft size={18}/></IconButton></header><div className="video-studio-workspace"><VideoStudio active={props.active!==false&&(mode==='video'||preparing==='video')} onReady={error=>admitted('video',error)} imageId={videoSource} onClearSource={()=>setVideoSource('')}/></div></main>}</div>
  {pending?.status==='error'&&<div className="studio-mode-error" role="alert"><span>{pending.error}</span><button type="button" onClick={()=>choose(pending.target)}>Повторить</button><IconButton label="Закрыть сообщение" onClick={cancelMode}><X size={16}/></IconButton></div>}
 </div></GenerationVideoContext.Provider>;
}

function ImageWorkspace({onMenu,onChat,userId,showMenuButton,workspaceActive,onReady}:StudioProps&{workspaceActive:boolean}){
 const {values:draft,edit:editDraft,ready:draftReady,syncError,flush:flushDraft,switchModel,importSettings}=useImageDraft(userId);
 const {prompt,negative,model,sampler,size,width,height,steps,cfg,seed}=draft;
 const setSampler=(value:string)=>editDraft({sampler:value});
 const setPrompt=(value:string)=>editDraft({prompt:value}),setNegative=(value:string)=>editDraft({negative:value}),setModel=(value:string)=>void switchModel(value),setSize=(value:string)=>editDraft({size:value}),setWidth=(value:string)=>editDraft({width:value}),setHeight=(value:string)=>editDraft({height:value}),setSteps=(value:number)=>editDraft({steps:value}),setCfg=(value:number)=>editDraft({cfg:value}),setSeed=(value:string)=>editDraft({seed:value});
 const [jobs,setJobs]=useSnapshotState<Job[]>([]),[config,setConfig]=useSnapshotState<StudioConfig|null>(null),[busy,setBusy]=useState(false),[loop,setLoop]=useState(false),[error,setError]=useState(''),[imageError,setImageError]=useState(''),[frame,setFrame]=useState<Frame|null>(null),[previous,setPrevious]=useState<Frame|null>(null);
 const importer=useImageSettingsImport(async values=>{if(loop)await syncLoop(false);await importSettings(values)},!draftReady||busy);
 // A phone in landscape still needs the touch workspace; fitting the desktop
 // canvas to its short viewport scales editable controls below a usable size.
 const mobileQuery='(max-width:800px), (pointer:coarse) and (max-height:500px)';
 const [mobile,setMobile]=useState(()=>matchMedia(mobileQuery).matches);
 useEffect(()=>{const media=matchMedia(mobileQuery),change=()=>setMobile(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);
 const current=useRef<Frame|null>(null),urls=useRef(new Set<string>()),revision=useRef(Date.now()),loopPending=useRef(false),reduced=useReducedMotion();
 const {layout,container,form,art,translator,zoomValue,viewport,style,formStyle,artStyle,translatorStyle,active,setActive,movingPanel,sizingWindow,panning,spaceHeld,viewportHandlers,startPanelMove,movePanel,endPanelMove,resetPanel,resetArt,resetTranslator,panelKey,panelDragged,resizeEdges,zoomBy,resetZoom,fitView,alignWindows}=useStudioWorkspace(userId,mobile);
 const hidden=useRef(new Set<string>());
 const canvas=useRef<HTMLDivElement>(null),[viewerOpen,setViewerOpen]=useState(false);
 const [comparison,setComparison]=useState<{jobs:Job[];initialId:string}|null>(null),[comparing,setComparing]=useState(false),compareTrigger=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{if(!workspaceActive){setViewerOpen(false);setComparing(false)}},[workspaceActive]);
 const [viewHistory,setViewHistory]=useState(false),[historyJob,setHistoryJob]=useState<Job|null>(null),[historyFrame,setHistoryFrame]=useState<Frame|null>(null),historyURL=useRef('');
 useEffect(()=>()=>{if(historyURL.current)URL.revokeObjectURL(historyURL.current)},[]);
 const getArtRect=()=>{const image=current.current?.job,rect=canvas.current?.getBoundingClientRect();return image&&rect?fitArtRect({x:rect.x,y:rect.y,width:rect.width,height:rect.height},image.width/image.height):null};
 const changeViewer=(open:boolean)=>setViewerOpen(open);
 const openArt=()=>{if(frame){setViewHistory(false);canvas.current?.focus({preventScroll:true});setViewerOpen(true)}};
 const openHistory=(job:Job)=>{setViewerOpen(false);setViewHistory(true);setHistoryJob({...job});setError('')};
 // Keep the last decoded frame and its URL alive until the next one is ready.
 useEffect(()=>{
  if(!viewHistory||!historyJob)return;let alive=true,url='',committed=false,cancelCompletion:(()=>void)|undefined;const controller=new AbortController();
  void(async()=>{try{
   const response=await fetch(`/api/images/${encodeURIComponent(historyJob.id)}/image/0`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal});
   if(!response.ok)throw Error('Не удалось открыть арт из истории');
   url=URL.createObjectURL(await response.blob());const image=new Image();image.src=url;await image.decode();if(!alive)return;
   const show=()=>{
    if(!alive)return;
    const previousURL=historyURL.current;historyURL.current=url;committed=true;
    setHistoryFrame({job:historyJob,url});setViewerOpen(true);
    if(previousURL&&previousURL!==url)URL.revokeObjectURL(previousURL);
   };
   // The actual closing sheet is the handoff barrier, not an assumed delay.
   cancelCompletion=afterSurfaceMotion(document.querySelector<HTMLElement>('.mobile-studio-sheet[data-state="closed"]'),show);
  }catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}})();
  return()=>{alive=false;controller.abort();cancelCompletion?.();if(url&&!committed)URL.revokeObjectURL(url)};
 },[viewHistory,historyJob]);
 const [confirmClear,setConfirmClear]=useState(false);
 const [deleted,setDeleted]=useState<Job|null>(null),[deletedBatch,setDeletedBatch]=useState<{batch:string;count:number}|null>(null),[deleting,setDeleting]=useState(false);
 useEffect(()=>{if(!deleted&&!deletedBatch)return;const timer=setTimeout(()=>{setDeleted(null);setDeletedBatch(null)},12000);return()=>clearTimeout(timer)},[deleted,deletedBatch]);
 const dimensions=size==='custom'?[Number(width),Number(height)]:size.split('x').map(Number);
 const parameters={prompt,negative,model,sampler,scheduler:draft.scheduler,denoise:draft.denoise??1,loras:draft.loras,width:dimensions[0],height:dimensions[1],steps,cfg,seed:Number(seed)};
 const localParameterError=!dimensions.every((n:number)=>Number.isInteger(n)&&n>=256&&n<=4096&&n%imageModelAlignment(model)===0)?`Размеры должны быть от 256 до 4096 px и кратны ${imageModelAlignment(model)}.`:!(steps>=1&&steps<=80&&Number.isInteger(steps))?'Шаги: целое число от 1 до 80.':!(cfg>=0&&cfg<=20)?'CFG должен быть от 0 до 20.':!((draft.denoise??1)>=0&&(draft.denoise??1)<=1)?'Denoise должен быть от 0 до 1.':!(seed!==''&&Number.isSafeInteger(Number(seed))&&Number(seed)>=-1)?'Seed: -1 или целое число до 9007199254740991.':config?.online&&!config.models.includes(model)?'Выбранный чекпоинт недоступен. Выбери установленную модель.':'';
 const parameterError=localParameterError;
 // Forms audit 2026-11-08: a half-typed number ("1" on the way to "1024") is not an error yet; show it after blur, hide it on the first corrective keystroke.
 const [numberEditing,setNumberEditing]=useState(false),shownParameterError=numberEditing?'':parameterError;
 const numberEditHandlers={onInputCapture:(e:{target:EventTarget})=>{if((e.target as HTMLInputElement).type==='number')setNumberEditing(true)},onBlurCapture:(e:{target:EventTarget})=>{if((e.target as HTMLInputElement).type==='number')setNumberEditing(false)}};
 const activeReady=draftReady,activeSyncError=syncError;
 const available=!!config?.online;
 const valid=!importer.busy&&!!config?.models?.includes(model)&&!!prompt.trim()&&!parameterError;
 const pending=jobs.find(j=>['queued','preparing','generating'].includes(j.status));
 const completed=jobs.filter(j=>j.status==='done'&&j.images?.length);
 // Without ComfyUI the create button is unavailable; say why in the layout, not only in a hover hint.
 const offlineNotice=config&&!config.online&&!pending?'ComfyUI не запущен. Запусти его — генерация включится сама.':'';
 const generateReason=busy?undefined:!activeReady?'Настройки ещё загружаются…':importer.busy?'Идёт импорт настроек…':!config?'Проверяю ComfyUI…':!available?'ComfyUI не запущен. Запусти его — генерация включится сама.':loop?'Идёт непрерывная генерация — выключи цикл, чтобы запустить вручную':pending?'Арт уже генерируется — дождись конца':!config?.models?.includes(model)?'Выбери чекпоинт из списка':!prompt.trim()?'Напиши промпт — без него генерация не запустится':parameterError||undefined;
 const [selectedArt,setSelectedArt]=useState<string|null>(null);
 const notifyReady=useRef(onReady);notifyReady.current=onReady;
 // Explicit selection stays pinned while new results arrive; null follows the latest.
 const target=completed.find(job=>job.id===selectedArt)||completed[0];
 const selectArt=(job:Job)=>setSelectedArt(job.id===completed[0]?.id?null:job.id);
 const loadingArt=target?.id!==frame?.job.id&&!imageError?target?.id:undefined;
 // Nothing gates the entrance: draft, history, the last art and the ComfyUI status all load inside the open studio.
 useLayoutEffect(()=>{if(workspaceActive)notifyReady.current?.()},[workspaceActive]);
 const openComparison=(source:HTMLButtonElement)=>{if(!frame||completed.length<2)return;compareTrigger.current=source;setComparison({jobs:[...completed],initialId:frame.job.id});setComparing(true)};
 const comparisonView=comparison&&<ArtComparison open={comparing} onOpenChange={setComparing} jobs={comparison.jobs} initialId={comparison.initialId} restoreFocus={()=>{if(compareTrigger.current?.isConnected)compareTrigger.current.focus({preventScroll:true});else canvas.current?.focus({preventScroll:true})}}/>;
 useEffect(()=>{if(selectedArt&&!completed.some(job=>job.id===selectedArt))setSelectedArt(null)},[selectedArt,jobs]);

 useEffect(()=>{
  if(!workspaceActive)return;let alive=true;const activeIds=new Set<string>();const refresh=async()=>{const loopRevision=revision.current;try{const history=await api('/api/images');if(alive){const list:Job[]=history.jobs.filter((job:Job)=>!hidden.current.has(job.id));list.forEach(job=>{if(['queued','preparing','generating'].includes(job.status))activeIds.add(job.id);else if(activeIds.delete(job.id)&&job.status==='done')notifyWhenHidden('LLM Chat','Генерация арта завершена',`image-${job.id}`)});setJobs(list);if(!loopPending.current&&loopRevision===revision.current)setLoop(history.loop?.enabled||false)}}catch(e){if(alive)setError(String(e))}};
  const stop=pollVisible(refresh,1200);return()=>{alive=false;stop()};
 },[workspaceActive]);
 // ComfyUI can finish starting after the page. Retry an offline first response.
 useEffect(()=>{
  if(!workspaceActive)return;
  let alive=true,pending=false,online=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=async()=>{
   if(!alive||pending)return;pending=true;clearTimeout(timer);
   try{
    const data:StudioConfig=await api('/api/images/config');if(!alive)return;
    setConfig(data);
    if(data.online&&!online)window.dispatchEvent(new Event('image-server-online'));
    online=data.online;
   }catch(e){
    if(alive){online=false;setConfig(value=>value?{...value,online:false}:value)}
   }finally{pending=false;if(alive)timer=setTimeout(()=>void refresh(),online?30000:3000)}
  };
  const wake=()=>{if(!document.hidden)void refresh()};
  void refresh();window.addEventListener('online',wake);document.addEventListener('visibilitychange',wake);
  return()=>{alive=false;clearTimeout(timer);window.removeEventListener('online',wake);document.removeEventListener('visibilitychange',wake)};
 },[workspaceActive]);
 useEffect(()=>{
  setImageError('');
  if(!target){current.current=null;setFrame(null);setPrevious(null);urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();return}
  if(target.id===current.current?.job.id)return;
  let cancelled=false,attempt=0,timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  const load=async()=>{
   let url='',retry=true;
   try{
    const response=await fetch(`/api/images/${encodeURIComponent(target.id)}/image/0`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal});
    if(!response.ok){retry=response.status>=500||response.status===408||response.status===429;throw Error(response.status===404?'Файл арта не найден':'Не удалось загрузить изображение')}
    retry=false;url=URL.createObjectURL(await response.blob());const image=new Image();image.src=url;await image.decode();
    if(cancelled){URL.revokeObjectURL(url);return}
    urls.current.add(url);setPrevious(current.current);const next={job:target,url};current.current=next;setFrame(next);setImageError('');
   }catch(e){
    if(url)URL.revokeObjectURL(url);if(cancelled)return;
    const message=e instanceof Error?e.message:String(e);setImageError(retry?'Не удалось загрузить изображение. Повторяю загрузку…':message);
    if(retry)timer=setTimeout(()=>void load(),Math.min(1000*2**attempt++,10000));
   }
  };
  void load();return()=>{cancelled=true;controller.abort();clearTimeout(timer)};
 },[target?.id]);
 const displayError=error||imageError;
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear()},[]);
 const finishFade=(id:string)=>{if(id!==current.current?.job.id)return;for(const url of urls.current){if(url!==current.current?.url){URL.revokeObjectURL(url);urls.current.delete(url)}}setPrevious(null)};
 const syncLoop=async(enabled:boolean)=>{
  // Order by the user's click, before waiting for settings/network. An older
  // enable must never overtake a newer disable and restart the cycle.
  const actionRevision=revision.current=Math.max(Date.now(),revision.current+1);
  loopPending.current=true;setLoop(enabled);
  try{
   if(enabled)await flushDraft();
   if(actionRevision!==revision.current)return false;
   const result=await api('/api/images/loop','PUT',{enabled,paused:enabled&&!valid,parameters:valid?parameters:undefined,revision:actionRevision});
   if(actionRevision===revision.current){setLoop(!!result.enabled);if(enabled)setSelectedArt(null)}
   return actionRevision===revision.current&&!!result.enabled===enabled;
  }catch(e){if(actionRevision===revision.current){setError(e instanceof Error?e.message:String(e));setLoop(false)}return false}
  finally{if(actionRevision===revision.current)loopPending.current=false}
 };

 const applyRecipe=async(values:ImageDraft)=>{
  setBusy(true);
  try{
   // Confirm the server-side cycle is off even if this tab's poll is stale.
   if(!await syncLoop(false))throw new Error('Не удалось выключить цикл. Рецепт пока не применён. Повторите попытку.');
   await importSettings(values);
  }finally{setBusy(false)}
 };
 const recipeControl=<StudioRecipes key={userId} userId={userId} draft={draft} ready={draftReady&&!busy&&!importer.busy} loop={loop} onApply={applyRecipe} compact={mobile}/>;

 const generate=async()=>{
  if(!valid||!activeReady||busy||pending||loop)return;
  setBusy(true);setError('');
  try{
   await flushDraft();
   const result=await api('/api/images','POST',parameters);
   setJobs(items=>[result.job,...items.filter(job=>job.id!==result.job.id)]);setSelectedArt(null);
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const historyChanged=()=>window.dispatchEvent(new Event('studio-history-changed'));
 const deleteArt=async(job=frame?.job)=>{if(!job||deleting)return;setDeleting(true);try{await api(`/api/images/${job.id}`,'DELETE');hidden.current.add(job.id);setDeletedBatch(null);setDeleted(job);setJobs(v=>v.filter(j=>j.id!==job.id));historyChanged()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setDeleting(false)}};
 const restoreArt=async()=>{if(deletedBatch){try{const result=await api(`/api/images/history/${deletedBatch.batch}/restore`,'POST');result.restored.forEach((id:string)=>hidden.current.delete(id));const history=await api('/api/images');setJobs(history.jobs);setDeletedBatch(null);historyChanged()}catch(e){setError(e instanceof Error?e.message:String(e))}return}if(!deleted)return;try{const result=await api(`/api/images/${deleted.id}/restore`,'POST');hidden.current.delete(deleted.id);setJobs(v=>[result.job,...v].sort((a,b)=>b.created-a.created));setDeleted(null);historyChanged()}catch(e){setError(e instanceof Error?e.message:String(e))}};
 const favoriteArt=async(job:Job)=>{try{const latest=jobs.find(item=>item.id===job.id)||job;const result=await api(`/api/images/${job.id}/favorite`,'PATCH',{favorite:!latest.favorite});setJobs(items=>items.map(item=>item.id===job.id?result.job:item));setFrame(value=>value?.job.id===job.id?{...value,job:result.job}:value);setHistoryFrame(value=>value?.job.id===job.id?{...value,job:result.job}:value);if(current.current?.job.id===job.id)current.current={...current.current,job:result.job};historyChanged()}catch(e){setError(e instanceof Error?e.message:String(e))}};
 const clearHistory=async()=>{if(deleting)return;setDeleting(true);try{const result=await api('/api/images/history','DELETE');jobs.filter(j=>!j.favorite&&['done','error','cancelled'].includes(j.status)).forEach(j=>hidden.current.add(j.id));setJobs(v=>v.filter(j=>j.favorite||!['done','error','cancelled'].includes(j.status)));setDeleted(null);setDeletedBatch(result);historyChanged()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setDeleting(false)}};
 const deleteSelectedArts=async(ids:string[])=>{
  if(deleting)throw Error('Дождитесь завершения удаления.');
  setDeleting(true);
  try{
   const result=await api('/api/images/history/delete','POST',{ids});
   const removed=new Set<string>(result.ids);removed.forEach(id=>hidden.current.add(id));
   setJobs(items=>items.filter(job=>!removed.has(job.id)));setDeleted(null);setDeletedBatch(result);historyChanged();
  }finally{setDeleting(false)}
 };
 const stopLocked=pending?.status==='preparing'&&pending.provider!=='aistudio';
 const stop=()=>void (pending&&api(`/api/images/${pending.id}/stop`,'POST').then(()=>setLoop(false)).catch(e=>setError(e.message)));
 const useParameters=(job:Job)=>{
  if(busy||pending||loop)return;
  if(job.provider==='aistudio'||job.model?.startsWith('aistudio/')){editDraft({prompt:job.prompt});return}
  editDraft({prompt:job.prompt,model:job.model||model,size:'custom',width:job.source_width??job.width,height:job.source_height??job.height,steps:job.steps??steps,cfg:job.cfg??cfg,sampler:job.sampler||sampler,negative:job.negative??negative,seed:'-1',scheduler:job.scheduler||draft.scheduler,denoise:job.denoise??1,loras:job.loras??defaultImageLoras(job.model||model)});
 };
 const viewedFrame=viewHistory?historyFrame:frame;
 const viewedIndex=viewedFrame?completed.findIndex(job=>job.id===viewedFrame.job.id):-1;
 const navigateViewer=(job:Job)=>{if(viewHistory)setHistoryJob({...job});else selectArt(job)};
 const viewer=viewedFrame&&<ArtViewer open={viewerOpen} onOpenChange={changeViewer} frame={viewedFrame} hasPrev={viewedIndex>0} hasNext={viewedIndex>=0&&viewedIndex<completed.length-1} onPrev={viewedIndex>0?()=>navigateViewer(completed[viewedIndex-1]):undefined} onNext={viewedIndex>=0&&viewedIndex<completed.length-1?()=>navigateViewer(completed[viewedIndex+1]):undefined} favoriteAction={<ArtFavoriteButton job={jobs.find(job=>job.id===viewedFrame.job.id)||viewedFrame.job} onFavorite={favoriteArt} className="art-viewer-close art-viewer-favorite"/>} imageId={viewedFrame.job.id} previous={viewHistory?null:previous} animation={viewHistory?'fade':'zoom'} getSourceRect={viewHistory?()=>null:getArtRect} restoreFocus={()=>{canvas.current?.focus({preventScroll:true})}} status={!viewHistory&&pending?`${(pending.operation==='upscale'&&pending.status==='generating'?'Увеличиваю арт':(pending.provider==='aistudio'?({queued:'В очереди',preparing:'Подготовка',generating:'Создаю изображение'} as Record<string,string>)[pending.status]:labels[pending.status]))}`:undefined} progress={!viewHistory&&pending?pending.progress:undefined}/>;
 const clearable=jobs.filter(j=>!j.favorite&&['done','error','cancelled'].includes(j.status)).length;
 const clearModal=<Modal open={confirmClear} onClose={()=>setConfirmClear(false)} title="Очистить историю артов?" description={`Будет удалено артов: ${clearable}. Избранное останется. Удалённые арты можно вернуть сразу после очистки.`} className="studio-clear-modal"><div className="confirm-actions"><Button variant="ghost" onClick={()=>setConfirmClear(false)}>Отмена</Button><Button variant="destructive" disabled={deleting||!clearable} onClick={()=>{setConfirmClear(false);void clearHistory()}}>Очистить историю</Button></div></Modal>;
 if(mobile)return <main className="main-panel image-studio studio-mobile" {...importer.handlers} {...numberEditHandlers}><StudioCosmos/>{importer.notice}<MobileImageStudio onDeleteMany={deleteSelectedArts} available={available} recipeControl={recipeControl} importControl={importer.control} draft={draft} edit={editDraft} onModel={setModel} ready={activeReady} config={config} frame={frame} previous={previous} pending={pending} jobs={completed} onSelectArt={selectArt} loadingArt={loadingArt} onCompare={openComparison} busy={busy} loop={loop} valid={!!valid} error={activeSyncError||displayError||shownParameterError||jobs[0]?.error||''} notice={offlineNotice} deleting={deleting} undo={deletedBatch?`Удалено артов · ${deletedBatch.count}`:deleted?'Арт удалён':''} canvas={canvas} onMenu={onMenu} onChat={onChat} onGenerate={()=>void generate()} onLoop={()=>void syncLoop(!loop)} onStop={stop} onOpenArt={openArt} onOpenHistory={openHistory} onDelete={job=>void deleteArt(job)} onClear={()=>setConfirmClear(true)} onRestore={()=>void restoreArt()} onUse={useParameters} onFavorite={favoriteArt} finishFade={finishFade}/>{viewer}{comparisonView}{clearModal}</main>;
 return <main className="main-panel image-studio" {...importer.handlers} {...numberEditHandlers}><StudioCosmos/>{importer.notice}<header className="chat-header"><div>{showMenuButton&&<IconButton data-sidebar-preview-trigger label="Открыть меню" onClick={onMenu}><PanelLeft size={18} data-panel-state="closed"/></IconButton>}</div><div className="studio-workspace-toolbar">{importer.control}<IconButton label="Выровнять окна" onClick={alignWindows}><PanelsTopLeft size={18}/></IconButton><div className="studio-zoom-controls"><IconButton label="Отдалить (Ctrl −)" onClick={()=>zoomBy(1/1.15)}><ZoomOut size={18}/></IconButton><HintButton className="studio-zoom-value" type="button" hint="Сбросить масштаб до 100% (Ctrl 0)" onClick={()=>resetZoom()}><span ref={zoomValue}>{Math.round(layout.zoom*100)}%</span></HintButton><IconButton label="Приблизить (Ctrl +)" onClick={()=>zoomBy(1.15)}><ZoomIn size={18}/></IconButton><IconButton label="Показать все панели" onClick={fitView}><Scan size={18}/></IconButton></div><IconButton label="Вернуться в чат" onClick={onChat}><ArrowLeft size={18}/></IconButton></div></header><div ref={viewport} className={`studio-scroll ${panning?'is-panning':''} ${spaceHeld?'is-space-held':''}`} {...viewportHandlers}><motion.div ref={container} className={`studio-content active-${active} ${movingPanel?`is-moving-panel is-moving-${movingPanel}`:''} ${sizingWindow?`is-sizing-window is-sizing-${sizingWindow}`:''}`} style={style} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.35}}><div ref={form} style={formStyle} className="studio-controls-window" onFocusCapture={()=>setActive('form')} onPointerDown={startPanelMove} onPointerMove={movePanel} onPointerUp={endPanelMove} onPointerCancel={endPanelMove} onLostPointerCapture={endPanelMove} onClickCapture={e=>{if(panelDragged.current){panelDragged.current=false;e.preventDefault();e.stopPropagation()}}}><form className="studio-form" onSubmit={e=>{e.preventDefault();void generate()}}><fieldset className="studio-fields" disabled={!activeReady}><div className="studio-settings-body"><div className="studio-heading studio-panel-grip" tabIndex={0} role="group" aria-label="Переместить панель настроек генерации" aria-description="Потяните, чтобы переместить. Двойной клик — вернуть на место." onDoubleClick={resetPanel} onKeyDown={panelKey}><div/></div><>{recipeControl}<label className="studio-model-label" htmlFor="image-checkpoint">Чекпоинт<Select id="image-checkpoint" value={model} displayValue={imageModelName(model)} onChange={e=>setModel(e.target.value)} disabled={!config?.online}>{<ImageModelOptions models={config?.models?.length?config.models:[model||config?.model||'anima_baseV10.safetensors']}/>}</Select></label><label htmlFor="image-prompt">Промпт</label><textarea id="image-prompt" placeholder="Опиши будущий арт…" value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void generate()}}} required maxLength={16000}/><label htmlFor="image-negative">Негативный промпт</label><textarea id="image-negative" value={negative} onChange={e=>setNegative(e.target.value)}/><PromptTranslation value={prompt} onApply={setPrompt} disabled={busy||!!pending||loop}/><LoraControls model={model} value={draft.loras} onChange={loras=>editDraft({loras})} onAddTriggers={text=>editDraft({prompt:[draft.prompt.trim(),text].filter(Boolean).join(', ')})}/><div className="studio-options"><label>Разрешение<Select value={size} displayValue={imageResolutionDisplay(size)} onChange={e=>setSize(e.target.value)}><ImageResolutionOption value="512x512" label="Квадрат" width={512} height={512}/><ImageResolutionOption value="1024x1024" label="Квадрат" width={1024} height={1024}/><ImageResolutionOption value="832x1216" label="Портрет" width={832} height={1216}/><ImageResolutionOption value="1216x832" label="Альбом" width={1216} height={832}/><ImageResolutionOption value="1248x1824" label="Большой портрет" width={1248} height={1824}/><ImageResolutionOption value="custom" label="Своё разрешение" custom/></Select></label></div><Reveal show={size==='custom'}><div className="studio-options two"><label>Ширина<input type="number" min={256} max={4096} step={imageModelAlignment(model)} value={width} onChange={e=>setWidth(e.target.value)}/></label><label>Высота<input type="number" min={256} max={4096} step={imageModelAlignment(model)} value={height} onChange={e=>setHeight(e.target.value)}/></label></div><small className="studio-hint">256–4096 px · размеры кратны {imageModelAlignment(model)}</small></Reveal><Disclosure className="studio-params-disclosure" title="Параметры генерации"><section className="studio-parameters" aria-label="Параметры генерации">
 <div className="studio-parameter-grid">
  <label>Шаги<input type="number" min={1} max={80} value={steps} onChange={e=>setSteps(Number(e.target.value))}/></label>
  <label>CFG<input type="number" min={0} max={20} step={.1} value={cfg} onChange={e=>setCfg(Number(e.target.value))}/></label>
  <label htmlFor="image-sampler">Семплер<Select id="image-sampler" value={sampler} onChange={e=>setSampler(e.target.value)} disabled={!config?.online}>{(config?.samplers?.length?config.samplers:[sampler]).map(name=><SelectOption key={name} value={name}>{name}</SelectOption>)}</Select></label>
  <label>Scheduler<Select value={draft.scheduler||'normal'} onChange={e=>editDraft({scheduler:e.target.value})} disabled={!config?.online}>{(config?.schedulers?.length?config.schedulers:[draft.scheduler||'normal']).map(name=><SelectOption key={name}>{name}</SelectOption>)}</Select></label>
  <label>Denoise<input aria-label="Denoise" type="number" min={0} max={1} step={.01} value={draft.denoise??1} onChange={e=>editDraft({denoise:Number(e.target.value)})}/></label>
  <label>Seed<input aria-label="Seed · −1 случайный" type="number" min={-1} max={9007199254740991} step={1} value={seed} onChange={e=>setSeed(e.target.value)}/></label>
 </div>
</section></Disclosure></></div><div className="studio-submit"><Reveal show={!!shownParameterError}><p role="status" className="inline-error">{shownParameterError}</p></Reveal><Reveal show={!!activeSyncError}><p role="status" className="inline-error">{activeSyncError}</p></Reveal><Reveal show={!!displayError}><p role="alert" className="inline-error">{displayError}</p></Reveal>{pending&&!loop?<Hint text={stopLocked?'ComfyUI освобождает память — остановить можно через секунду':undefined}><span className="hint-anchor hint-anchor-block"><Button type="button" variant="default" className="studio-generate-button studio-stop-button" disabled={stopLocked} onClick={stop}><Square size={16}/>Остановить генерацию</Button></span></Hint>:<Hint text={generateReason}><span className="hint-anchor hint-anchor-block"><Button type="submit" variant="default" className="studio-generate-button" disabled={busy||!valid||!available||!!pending||loop}><StateTransition className="is-icon" stateKey={busy?'busy':'ready'}>{busy?<Loader2 size={16} className="spin"/>:<ImagePlus size={16}/>}</StateTransition>Сгенерировать<kbd>Ctrl ↵</kbd></Button></span></Hint>}{<Button type="button" variant="outline" aria-pressed={loop} className={loop?'studio-loop active is-active':'studio-loop'} disabled={busy||(!loop&&(!valid||!config?.online))} onClick={()=>void syncLoop(!loop)}><Repeat size={16} className="studio-cycle-icon"/><StateTransition stateKey={loop?'running':'off'}>{loop?'Выключить цикл':'Включить цикл генерации'}</StateTransition></Button>}<Reveal show={!!offlineNotice&&!loop}><small className="studio-loop-note" role="status">{offlineNotice}</small></Reveal><Reveal show={loop}><small className="studio-loop-note">{valid?'Изменения применятся к следующему арту. Выключение завершит текущий.':'Следующий арт ждёт корректных параметров.'}</small></Reveal></div></fieldset></form>{resizeEdges('form')}</div><div ref={art} style={artStyle} className="studio-art-window is-height-sized" onFocusCapture={()=>setActive('art')} onPointerDown={startPanelMove} onPointerMove={movePanel} onPointerUp={endPanelMove} onPointerCancel={endPanelMove} onLostPointerCapture={endPanelMove} onClickCapture={e=>{if(panelDragged.current){panelDragged.current=false;e.preventDefault();e.stopPropagation()}}}><section className="studio-art" onDragStart={e=>e.preventDefault()}><header className="studio-art-header" tabIndex={0} role="group" aria-label="Переместить панель арта" onDoubleClick={e=>{if(!(e.target as Element).closest('button,a'))resetArt()}} onKeyDown={panelKey}><div><StateTransition className="studio-status-transition" stateKey={pending?`${pending.id}:${pending.status}`:loop?'loop':frame?'ready':'empty'}>{pending?<><Loader2 size={14} className="spin"/>{(pending.operation==='upscale'&&pending.status==='generating'?'Увеличиваю арт':(pending.provider==='aistudio'?({queued:'В очереди',preparing:'Подготовка',generating:'Создаю изображение'} as Record<string,string>)[pending.status]:labels[pending.status]))}{pending.progress!=null?` · ${pending.progress}%`:''}</>:loop?'Цикл включён':frame?'Готово':null}</StateTransition></div><div className="studio-art-actions" role="group" aria-label="Действия с артом">
 {pending&&<IconButton label="Остановить генерацию" disabled={pending.status==='preparing'&&pending.provider!=='aistudio'} onClick={stop}><Square size={16}/></IconButton>}
 {frame&&<ArtFavoriteButton job={jobs.find(job=>job.id===frame.job.id)||frame.job} onFavorite={favoriteArt}/>}
 {frame&&<ArtUpscaleButton imageId={frame.job.id}/>}
 <ArtAnimateButton imageId={frame?.job.id}/>
 {frame&&<ArtDownload url={frame.url} imageId={frame.job.id} name={`Art-${frame.job.seed??frame.job.id}`} className="studio-download" size={16}/>}
 <DropdownMenu><DropdownMenuTrigger asChild><IconButton label="Ещё действия с артом" showHint={false}><MoreHorizontal size={16}/></IconButton></DropdownMenuTrigger>
  <DropdownMenuContent className="floating-panel studio-art-menu" align="end" sideOffset={8}>
   <DropdownMenuItem disabled={layout.artX===368&&layout.artY===24} onSelect={resetArt}><RotateCcw size={16}/>Вернуть арт на место</DropdownMenuItem>
   {frame&&<DropdownMenuItem disabled={busy||!!pending||loop} onSelect={()=>useParameters(frame.job)}><Repeat size={16}/>Повторить настройки</DropdownMenuItem>}
   {frame&&<DropdownMenuItem className="destructive" disabled={deleting} onSelect={()=>void deleteArt()}><Trash2 size={16}/>Удалить арт из истории</DropdownMenuItem>}
  </DropdownMenuContent>
 </DropdownMenu>
</div></header><div ref={canvas} className={`studio-canvas ${frame?'has-art':''}`} role={frame?'button':undefined} tabIndex={frame?0:undefined} aria-label={frame?'Открыть арт на весь экран':undefined} onClick={openArt} onKeyDown={e=>{if(frame&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();openArt()}}}><StudioProgress job={pending}/>{previous&&<img draggable={false} src={previous.url} alt="Предыдущий арт"/>}{frame?<motion.img draggable={false} key={frame.job.id} src={frame.url} alt={frame.job.prompt} initial={{opacity:0}} animate={{opacity:1}} transition={fadeTransition(reduced,motionDuration.surface)} onAnimationComplete={()=>finishFade(frame.job.id)}/>:<div className={`studio-empty ${pending?'is-generating':''}`}><StateTransition className="is-icon studio-empty-glyph" stateKey={pending?'generating':'empty'}>{pending?<Loader2 size={28} className="spin"/>:<ImagePlus size={32}/>}</StateTransition><p><StateTransition stateKey={pending?`${pending.id}:${pending.status}`:'empty'}>{pending?(pending.operation==='upscale'&&pending.status==='generating'?'Увеличиваю арт':(pending.provider==='aistudio'?({queued:'В очереди',preparing:'Подготовка',generating:'Создаю изображение'} as Record<string,string>)[pending.status]:labels[pending.status])):'Здесь появится арт'}</StateTransition></p><small><StateTransition stateKey={pending?'pending-hint':'empty-hint'}>{pending?(pending.progress!=null?`Выполнено ${pending.progress}% · результат появится автоматически`:'Генерация запущена · результат появится здесь'):'Напиши промпт слева и нажми «Сгенерировать».'}</StateTransition></small></div>}</div><AnimatePresence initial={false}>{(deleted||deletedBatch)&&<motion.div key="undo" className="studio-undo" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.2}}><span>{deletedBatch?`Удалено артов · ${deletedBatch.count}`:'Арт удалён из истории'}</span><Button variant="ghost" type="button" onClick={()=>void restoreArt()}>Вернуть</Button><IconButton label="Скрыть уведомление" showHint={false} onClick={()=>{setDeleted(null);setDeletedBatch(null)}}><X size={14}/></IconButton></motion.div>}</AnimatePresence>{!!completed.length&&<StudioFilmstrip jobs={completed} selected={frame?.job.id} loading={loadingArt} onSelect={selectArt} onCompare={openComparison}/>}{frame&&<div className="studio-art-info"><StudioArtMetadata job={frame.job}/><Disclosure key={frame.job.id} title="Промпт"><p>{frame.job.prompt}</p></Disclosure></div>}<div className="studio-history-panel"><Disclosure title="Вся история"><div className="studio-history-toolbar"><span>Выбери арт, чтобы открыть</span><Button type="button" variant="ghost" disabled={deleting||!jobs.some(j=>['done','error','cancelled'].includes(j.status))} onClick={()=>setConfirmClear(true)}><Trash2 size={14}/>Очистить всю историю</Button></div><StudioHistory onDeleteMany={deleteSelectedArts} undo={deletedBatch?`Удалено артов · ${deletedBatch.count}`:deleted?'Арт удалён':''} onRestore={()=>void restoreArt()} jobs={completed} selected={frame?.job.id} deleting={deleting} onOpen={openHistory} onDelete={job=>void deleteArt(job)} onFavorite={favoriteArt}/></Disclosure></div><Reveal show={!!jobs[0]?.error}><p className="inline-error">{jobs[0]?.error}</p></Reveal></section>{resizeEdges('art')}</div><div ref={translator} style={translatorStyle} className="studio-translator-window" onFocusCapture={()=>setActive('translator')} onPointerDown={startPanelMove} onPointerMove={movePanel} onPointerUp={endPanelMove} onPointerCancel={endPanelMove} onLostPointerCapture={endPanelMove} onClickCapture={e=>{if(panelDragged.current){panelDragged.current=false;e.preventDefault();e.stopPropagation()}}}><section className="studio-form studio-translator-body"><header className="studio-heading studio-panel-grip" tabIndex={0} role="group" aria-label="Переместить панель перевода" aria-description="Потяните, чтобы переместить. Двойной клик — вернуть на место." onDoubleClick={resetTranslator} onKeyDown={panelKey}><div/></header><QuickTranslatorBlock standalone onInsert={(text,mode)=>{editDraft({prompt:mode==='replace'?text:[draft.prompt.trim(),text].filter(Boolean).join(', ')});const field=document.getElementById('image-prompt');field?.focus();field?.classList.remove('is-flash');void field?.offsetWidth;field?.classList.add('is-flash')}}/></section>{resizeEdges('translator')}</div></motion.div></div>{viewer}{comparisonView}{clearModal}</main>;
}

