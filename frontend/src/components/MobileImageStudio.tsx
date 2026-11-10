import {HintButton} from './Hint';
import {useSurfaceSwipe} from '../useSurfaceSwipe';
import {probeWindow} from '../motionProbe';
import {followLayoutShift} from '../layoutFollow';
import {presentSheet} from '../motionProfile';
import {LoraControls} from './LoraControls';
import {PromptTranslation} from './PromptTranslation';
import {Select,SelectOption} from './Select';
import {ImageModelOptions,imageModelName,imageModelAlignment} from './imageModels';
import {useContext,useRef,useState,useEffect,useLayoutEffect,type MouseEvent as ReactMouseEvent,type ReactNode,type RefObject} from 'react';
import {ChatComposerEditor,type EditorCallbacks} from './ChatComposerEditor';
import {isIOSWebKit} from '../iosKeyboardFocus';
import {attachTouchScroll} from '../touchScroll';
import {Dialog} from 'radix-ui';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {softTransition,fadeTransition,motionDuration} from '../motion';
import {PanelLeft,ArrowLeft,History,SlidersHorizontal,Sparkles,ImagePlus,Trash2,Repeat,Square,ChevronDown,Check,X,Loader2,Languages,MoreHorizontal} from '../icons';
import {Button,IconButton,Disclosure} from './primitives';
import {StudioProgress,useStudioEta} from './StudioProgress';
import {StudioHistory} from './StudioHistory';
import {StudioFilmstrip} from './StudioFilmstrip';
import {StudioArtMetadata} from './StudioArtMetadata';
import {ArtFavoriteButton} from './ArtFavoriteButton';
import {ArtDownload} from './ArtDownload';
import {ArtAnimateButton,GenerationVideoContext} from './ArtAnimator';
import {ArtUpscaleButton} from './ArtUpscaler';
import {Translator} from './Translator';
import {StateTransition} from './StateTransition';
import {triggerHaptic} from '../haptics';
import type {ImageDraft} from './useImageDraft';
import type {StudioJob,StudioFrame,StudioConfig} from './studioTypes';
import './MobileImageStudio.css';

type Panel='settings'|'model'|'format'|'history'|'details'|'translator';
const formats=[{value:'1024x1024',name:'Квадрат',width:1024,height:1024},{value:'832x1216',name:'Портрет',width:832,height:1216},{value:'1216x832',name:'Альбом',width:1216,height:832},{value:'512x512',name:'Маленький',width:512,height:512},{value:'1248x1824',name:'Большой портрет',width:1248,height:1824}];
const statusLabels:Record<string,string>={queued:'В очереди',preparing:'Подготовка',generating:'Создаю арт'};
const modelName=imageModelName;

// Typing collapses the stage in one CSS step (MobileImageStudio.css) and the
// composer glides to its new place; the probe reports the frame cadence meanwhile.
const probeTyping=(state:string)=>probeWindow('studio_typing',state);
export function MobileImageStudio({onDeleteMany,available,recipeControl,importControl,draft,edit,onModel,ready,config,frame,previous,pending,jobs,busy,loop,valid,error,notice='',deleting,undo,canvas,onMenu,onChat,onGenerate,onLoop,onStop,onOpenArt,onOpenHistory,onSelectArt,loadingArt,onCompare,onDelete,onClear,onRestore,onUse,onFavorite,finishFade}:{
 available:boolean;
 onDeleteMany:(ids:string[])=>Promise<void>;recipeControl?:ReactNode;importControl?:ReactNode;onModel:(model:string)=>void;draft:ImageDraft;edit:(patch:Partial<ImageDraft>)=>void;ready:boolean;config:StudioConfig|null;frame:StudioFrame|null;previous:StudioFrame|null;pending?:StudioJob;jobs:StudioJob[];busy:boolean;loop:boolean;valid:boolean;error:string;notice?:string;deleting:boolean;undo:string;canvas:RefObject<HTMLDivElement|null>;
 onSelectArt:(job:StudioJob)=>void;loadingArt?:string;onCompare:(source:HTMLButtonElement)=>void;
 onMenu:()=>void;onChat:()=>void;onGenerate:()=>void;onLoop:()=>void;onStop:()=>void;onOpenArt:()=>void;onOpenHistory:(job:StudioJob,source:HTMLElement)=>void;onDelete:(job?:StudioJob)=>void;onClear:()=>void;onRestore:()=>void;onUse:(job:StudioJob)=>void;onFavorite:(job:StudioJob)=>Promise<void>;finishFade:(id:string)=>void;
}){
 const reduced=useReducedMotion(),[panel,setPanel]=useState<Panel>('settings'),[panelOpen,setPanelOpen]=useState(false),sheet=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement|null>(null);
 const promptTextarea=useRef<HTMLTextAreaElement>(null),negativeTextarea=useRef<HTMLTextAreaElement>(null),stage=useRef<HTMLDivElement>(null),composer=useRef<HTMLFormElement>(null),follow=useRef<{arm:()=>void}|null>(null),reducedRef=useRef(reduced);
 reducedRef.current=reduced;
 // iPhone Safari delays native text input in a large React page (first letter, then a burst of text);
 // the prompt is edited in the same small isolated document as the chat composer there.
 const isolatedPrompt=useRef(isIOSWebKit(navigator.userAgent,navigator.platform,navigator.maxTouchPoints)).current;
 const promptCallbacks=useRef<EditorCallbacks>({input:()=>{},blur:()=>{},composition:()=>{},paste:()=>{},drop:()=>{},key:()=>{}});
 promptCallbacks.current={...promptCallbacks.current,input:prompt=>edit({prompt})};
 const blurPrompt=()=>{const el=promptTextarea.current;if(el&&el.ownerDocument.activeElement===el)el.blur()};
 useLayoutEffect(()=>{
  const el=promptTextarea.current;if(!isolatedPrompt||!el)return;
  const root=document.querySelector<HTMLElement>('.studio-mobile');
  const focus=()=>{if(root)root.dataset.promptFocus='true';follow.current?.arm();probeTyping('open')};
  const blur=()=>{if(root)delete root.dataset.promptFocus;follow.current?.arm();probeTyping('close')};
  el.addEventListener('focus',focus);el.addEventListener('blur',blur);
  return()=>{el.removeEventListener('focus',focus);el.removeEventListener('blur',blur);if(root)delete root.dataset.promptFocus};
 },[isolatedPrompt]);
 useLayoutEffect(()=>{const el=promptTextarea.current;if(isolatedPrompt&&el&&el.value!==draft.prompt)el.value=draft.prompt},[isolatedPrompt,draft.prompt]);
 useEffect(()=>{
  const area=stage.current,form=composer.current;if(!area||!form)return;
  const follower=followLayoutShift(form,[area],()=>reducedRef.current);follow.current=follower;
  // The art reappears softly once the stage has room again.
  let open=area.offsetHeight>0;
  const reveal=new ResizeObserver(()=>{const now=area.offsetHeight>0;if(now&&!open&&!reducedRef.current)area.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});open=now});
  reveal.observe(area);
  return()=>{follower.stop();reveal.disconnect();follow.current=null};
 },[]);
 useEffect(()=>isolatedPrompt?undefined:attachTouchScroll(promptTextarea.current),[isolatedPrompt]);
 useEffect(()=>attachTouchScroll(negativeTextarea.current),[panelOpen,panel]);
 useEffect(()=>{
  const el=promptTextarea.current;if(!el||isolatedPrompt)return;
  el.style.height='auto';
  const target=Math.min(140,Math.max(52,el.scrollHeight));
  el.style.height=`${target}px`;
 },[draft.prompt]);
 // While typing the composer stretches to the keyboard; a tap on its empty part must not take focus
 // from the prompt (that would close the keyboard and collapse the layout), like the Done button.
 const keepPromptFocus=(event:ReactMouseEvent)=>{
  const target=event.target as Element,typing=document.querySelector<HTMLElement>('.studio-mobile')?.dataset.promptFocus==='true'||promptTextarea.current?.ownerDocument.activeElement===promptTextarea.current;
  if(typing&&!target.closest('button,input,textarea,select,a,label,iframe,[role=button],.app-select'))event.preventDefault();
 };
 const openPanel=(kind:Panel,source:HTMLElement)=>{trigger.current=source;setPanel(kind);setPanelOpen(true)};
 const closePanel=()=>setPanelOpen(false);
 // «Оживить» in the art sheet switches to the video tab; the sheet must not stay open over it.
 const openVideo=useContext(GenerationVideoContext),animateFromSheet=openVideo?(id:string)=>{closePanel();openVideo(id)}:null;
 useSurfaceSwipe(sheet,'.mobile-studio-sheet-grip,.mobile-studio-sheet>header',closePanel,panelOpen);
 const attachSheet=useRef((node:HTMLDivElement|null)=>{sheet.current=node;if(!node)return;const release=presentSheet(node);return()=>{release();if(sheet.current===node)sheet.current=null}}).current;
 const sheetSeen=useRef(false);
 useEffect(()=>{if(panelOpen)sheetSeen.current=true;else if(!sheetSeen.current)return;probeWindow('studio_sheet',panelOpen?'open':'close',520)},[panelOpen]);
 const selectedFormat=formats.find(format=>format.value===draft.size);
 const title={settings:'Настройки генерации',model:'Чекпоинт',format:'Формат изображения',history:'История артов',details:'Об этом арте',translator:'Перевод'}[panel];
 const dimensions=draft.size==='custom'?[draft.width,draft.height]:draft.size.split('x');
 const {eta}=useStudioEta(pending);
 const status=pending?`${pending.operation==='upscale'&&pending.status==='generating'?'Увеличиваю арт':statusLabels[pending.status]||'Генерация'}${pending.progress!=null?' · '+pending.progress+'%':''}${eta?' · '+eta:''}`:loop?'Цикл включён':'';
 const generateLabel=loop?'Остановить цикл':pending?pending.status==='preparing'?'Подготовка…':'Остановить':busy?'Запускаю…':'Создать';
 const primaryDisabled=busy||!ready||(!loop&&pending?.status==='preparing'&&pending.provider!=='aistudio')||(!loop&&!pending&&(!valid||!available));
 const primaryAction=()=>{triggerHaptic('light');if(loop)onLoop();else if(pending)onStop();else{(document.activeElement as HTMLElement)?.blur();onGenerate()}};
 const openFromHistory=(job:StudioJob,source:HTMLElement)=>{closePanel();onOpenHistory(job,source)};
 const customSize=<div className="mobile-studio-fields two"><label>Ширина<input aria-label="Ширина изображения" type="number" min={256} max={4096} step={imageModelAlignment(draft.model)} value={draft.width} onChange={event=>edit({width:event.target.value})}/></label><label>Высота<input aria-label="Высота изображения" type="number" min={256} max={4096} step={imageModelAlignment(draft.model)} value={draft.height} onChange={event=>edit({height:event.target.value})}/></label></div>;

 return <>
  <header className="mobile-studio-header" onClick={blurPrompt}><IconButton label="Открыть меню" onClick={onMenu}><PanelLeft size={18}/></IconButton><h1>Генерация</h1><ArtAnimateButton/><IconButton label="История артов" onClick={event=>openPanel('history',event.currentTarget)}><History size={18}/>{jobs.length>0&&<i className="mobile-studio-history-dot"/>}</IconButton><IconButton label="Вернуться в чат" onClick={onChat}><ArrowLeft size={18}/></IconButton></header>
  <div ref={stage} className="mobile-studio-stage"><motion.div ref={canvas} className={`studio-canvas mobile-studio-canvas ${frame?'has-art':''}`} role={frame?'button':undefined} tabIndex={frame?0:undefined} aria-label={frame?'Открыть арт на весь экран':undefined} onClick={onOpenArt} onKeyDown={event=>{if(frame&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onOpenArt()}}} initial={{opacity:0}} animate={{opacity:1}} transition={softTransition(reduced,motionDuration.surface)}>
   <StudioProgress job={pending} label={false}/>{previous&&<img src={previous.url} alt="Предыдущий арт" draggable={false}/>}{frame?<motion.img key={frame.job.id} src={frame.url} alt={frame.job.prompt} draggable={false} initial={{opacity:0}} animate={{opacity:1}} transition={fadeTransition(reduced,motionDuration.surface)} onAnimationComplete={()=>finishFade(frame.job.id)}/>:<div className={`mobile-studio-empty ${pending?'is-generating':''}`}><span className="mobile-studio-empty-icon"><StateTransition className="is-icon mobile-studio-empty-glyph" stateKey={pending?'generating':'empty'}>{pending?<Loader2 size={24} className="spin"/>:<ImagePlus size={28}/>}</StateTransition></span><strong><StateTransition stateKey={pending?`${pending.id}:${pending.status}`:'empty'}>{pending?(pending.operation==='upscale'&&pending.status==='generating'?'Увеличиваю арт':statusLabels[pending.status]||'Генерация'):'Начни с идеи'}</StateTransition></strong><p><StateTransition stateKey={pending?'pending-hint':'empty-hint'}>{pending?(pending.progress!=null?`Выполнено ${pending.progress}% · арт скоро появится`:'Твой арт сейчас создаётся…'):<>Опиши, что хочешь увидеть.<br/>Твой арт появится здесь.</>}</StateTransition></p></div>}
  </motion.div>
  <AnimatePresence initial={false}>{status&&<motion.div className="mobile-studio-status" role="status" initial={{opacity:0,y:-5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={softTransition(reduced,motionDuration.detail)}>{pending?<Loader2 size={12} className="spin"/>:<i/>}<StateTransition stateKey={status}>{status}</StateTransition></motion.div>}</AnimatePresence>
  {frame&&<div className="mobile-studio-art-tools"><ArtFavoriteButton job={jobs.find(job=>job.id===frame.job.id)||frame.job} onFavorite={onFavorite}/><ArtDownload url={frame.url} imageId={frame.job.id} name={`Art-${frame.job.seed??frame.job.id}`} className="mobile-studio-download"/><HintButton type="button" className="mobile-studio-art-more" aria-label="Действия с артом" aria-haspopup="dialog" onClick={event=>openPanel('details',event.currentTarget)}><MoreHorizontal size={18}/></HintButton></div>}
  </div>
  <div className="mobile-studio-recent"><StudioFilmstrip jobs={jobs} selected={frame?.job.id} loading={loadingArt} onSelect={onSelectArt} onCompare={onCompare}/></div>
  <AnimatePresence initial={false}>{undo&&!panelOpen&&<motion.div className="mobile-studio-undo" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={softTransition(reduced,motionDuration.detail)}><span>{undo}</span><button type="button" onClick={onRestore}>Вернуть</button></motion.div>}</AnimatePresence>
  <form ref={composer} className="mobile-studio-composer" onMouseDown={keepPromptFocus} onSubmit={event=>{event.preventDefault();primaryAction()}}><fieldset disabled={!ready}>
   <div className="mobile-studio-quick">{frame&&<button type="button" className="mobile-studio-thumb" aria-label="Открыть последний арт на весь экран" onClick={onOpenArt}><img src={frame.url} alt="" draggable={false}/></button>}<button type="button" className="mobile-studio-model-chip" onClick={event=>openPanel('model',event.currentTarget)}><span>{modelName(draft.model||config?.model||'Чекпоинт')}</span><ChevronDown size={12}/></button><button type="button" className="mobile-studio-format-chip" onClick={event=>openPanel('format',event.currentTarget)}><span className="mobile-studio-ratio" style={{aspectRatio:Number(dimensions[0])/Number(dimensions[1])}}/>{selectedFormat?.name||'Свой размер'}</button>{recipeControl}<IconButton label="Настройки генерации" onClick={event=>openPanel('settings',event.currentTarget)}><SlidersHorizontal size={18}/></IconButton><button type="button" className="mobile-studio-keyboard-done" aria-label="Скрыть клавиатуру" onMouseDown={event=>event.preventDefault()} onClick={blurPrompt}><Check size={14}/><span>Готово</span></button></div>
   {isolatedPrompt?<ChatComposerEditor field={promptTextarea} callbacks={promptCallbacks} hint="Опиши будущий арт…" disabled={!ready} welcome={false} label="Промпт" maxLength={16000}/>:<textarea ref={promptTextarea} className="mobile-studio-prompt" aria-label="Промпт" placeholder="Опиши будущий арт…" value={draft.prompt} onChange={event=>edit({prompt:event.target.value})} onFocus={()=>{follow.current?.arm();probeTyping('open')}} onBlur={()=>{follow.current?.arm();probeTyping('close')}} rows={3} maxLength={16000} spellCheck={false}/>}
   <div className="mobile-studio-create-row"><HintButton type="button" className={`mobile-studio-cycle ${loop?'is-active':''}`} aria-label={loop?'Выключить непрерывную генерацию':'Включить непрерывную генерацию'} aria-pressed={loop} disabled={busy||(!loop&&(!valid||!available))} onClick={()=>{triggerHaptic('light');onLoop()}}><Repeat size={18}/></HintButton><HintButton type="button" className="mobile-studio-translate" aria-label="Перевод промпта" aria-haspopup="dialog" onMouseDown={event=>event.preventDefault()} onClick={event=>openPanel('translator',event.currentTarget)}><Languages size={18}/></HintButton><Button type="submit" className="mobile-studio-create" disabled={primaryDisabled}><StateTransition className="is-icon" stateKey={loop||pending?'stop':busy?'busy':'create'}>{loop||pending?<Square size={16}/>:busy?<Loader2 size={16} className="spin"/>:<Sparkles size={18}/>}</StateTransition><StateTransition stateKey={generateLabel}>{generateLabel}</StateTransition></Button></div>
   <AnimatePresence initial={false}>{loop&&<motion.p className="mobile-studio-loop-note" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={softTransition(reduced,motionDuration.detail)}>{valid?'Изменения применятся к следующему арту':'Следующий арт ждёт корректных настроек'}</motion.p>}</AnimatePresence>
   <AnimatePresence initial={false}>{notice&&!error&&!loop&&<motion.p className="mobile-studio-loop-note" role="status" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={softTransition(reduced,motionDuration.detail)}>{notice}</motion.p>}</AnimatePresence>
   <AnimatePresence initial={false}>{error&&<motion.p className="mobile-studio-error" role="alert" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={softTransition(reduced,motionDuration.detail)}>{error}</motion.p>}</AnimatePresence>
  </fieldset></form>
  <Dialog.Root open={panelOpen} onOpenChange={setPanelOpen}><Dialog.Portal><Dialog.Overlay className="mobile-studio-sheet-backdrop"/><Dialog.Content ref={attachSheet} className={`mobile-studio-sheet is-${panel}`} aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();sheet.current?.focus({preventScroll:true})}} onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus({preventScroll:true})}}>
   <div className="mobile-studio-sheet-grip" aria-hidden="true"/><header><Dialog.Title>{title}</Dialog.Title>{panel==='settings'&&<span className="mobile-studio-sheet-import">{importControl}</span>}<Dialog.Close className="mobile-studio-sheet-close" aria-label="Закрыть панель"><X size={18}/></Dialog.Close></header>
   <div className="mobile-studio-sheet-body"><AnimatePresence mode="wait" initial={false}><motion.div key={panel} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={softTransition(reduced,motionDuration.detail)}>
    {panel==='model'&&<div className="mobile-studio-models">{(config?.models?.length?config.models:[draft.model]).map(name=><button type="button" key={name} disabled={!ready||!config?.online} aria-pressed={draft.model===name} onClick={()=>{onModel(name);closePanel()}}><span>{modelName(name)}</span>{draft.model===name&&<Check size={16}/>}</button>)}</div>}
    {panel==='format'&&<><div className="mobile-studio-formats">{formats.map(format=><button type="button" key={format.value} aria-pressed={draft.size===format.value} onClick={()=>{edit({size:format.value});closePanel()}}><span className="mobile-studio-format-icon" style={{aspectRatio:format.width/format.height}}/><strong>{format.name}</strong><small>{format.width} × {format.height}</small>{draft.size===format.value&&<Check className="mobile-studio-format-check" size={14}/>}</button>)}<button type="button" aria-pressed={draft.size==='custom'} onClick={()=>edit({size:'custom'})}><SlidersHorizontal size={20}/><strong>Свой размер</strong><small>Ширина и высота</small></button></div><AnimatePresence initial={false}>{draft.size==='custom'&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={softTransition(reduced,motionDuration.detail)}>{customSize}<small className="mobile-studio-field-hint">256–4096 px · кратно {imageModelAlignment(draft.model)}</small><Button className="mobile-studio-done" onClick={closePanel}>Готово</Button></motion.div>}</AnimatePresence></>}
    {panel==='settings'&&<fieldset className="mobile-studio-settings" disabled={!ready}><label>Чекпоинт<Select value={draft.model} displayValue={imageModelName(draft.model)} onChange={event=>onModel(event.target.value)} disabled={!config?.online}>{<ImageModelOptions models={config?.models?.length?config.models:[draft.model]}/>}</Select></label><label>Разрешение<Select value={draft.size} onChange={event=>edit({size:event.target.value})}>{formats.map(format=><SelectOption key={format.value} value={format.value}>{format.name} · {format.width} × {format.height}</SelectOption>)}<SelectOption value="custom">Свой размер</SelectOption></Select></label>{draft.size==='custom'&&customSize}<div className="mobile-studio-fields two"><label>Шаги<input aria-label="Шаги" type="number" min={1} max={80} value={draft.steps} onChange={event=>edit({steps:Number(event.target.value)})}/></label><label>CFG<input aria-label="CFG" type="number" min={0} max={20} step={.1} value={draft.cfg} onChange={event=>edit({cfg:Number(event.target.value)})}/></label></div><label>Семплер<Select value={draft.sampler} onChange={event=>edit({sampler:event.target.value})} disabled={!config?.online}>{(config?.samplers?.length?config.samplers:[draft.sampler]).map(name=><SelectOption key={name}>{name}</SelectOption>)}</Select></label><div className="mobile-studio-fields two"><label>Scheduler<Select value={draft.scheduler||'normal'} onChange={e=>edit({scheduler:e.target.value})} disabled={!config?.online}>{(config?.schedulers?.length?config.schedulers:[draft.scheduler||'normal']).map(name=><SelectOption key={name}>{name}</SelectOption>)}</Select></label><label>Denoise<input aria-label="Denoise" type="number" min={0} max={1} step={.01} value={draft.denoise??1} onChange={e=>edit({denoise:Number(e.target.value)})}/></label></div><LoraControls model={draft.model} value={draft.loras} onChange={loras=>edit({loras})} onAddTriggers={text=>edit({prompt:[draft.prompt.trim(),text].filter(Boolean).join(', ')})}/><Disclosure title="Дополнительно"><label>Негативный промпт<textarea ref={negativeTextarea} value={draft.negative} onChange={event=>edit({negative:event.target.value})}/></label><label>Seed<input type="number" min={-1} max={9007199254740991} value={draft.seed} onChange={event=>edit({seed:event.target.value})}/></label><small className="mobile-studio-field-hint">−1 — случайный для каждого арта</small></Disclosure><Button className="mobile-studio-done" onClick={closePanel}>Готово</Button></fieldset>}
    {panel==='translator'&&<div className="mobile-studio-translator"><section className="mobile-studio-prompt-translation" aria-label="Перевод промпта"><h3>Промпт на английский</h3><PromptTranslation value={draft.prompt} onApply={prompt=>{edit({prompt});closePanel()}} disabled={busy||!!pending||loop}/>{!draft.prompt.trim()&&<small className="mobile-studio-field-hint">Сначала напиши промпт — здесь его можно перевести и сразу подставить.</small>}</section><section aria-label="Переводчик"><h3>Переводчик</h3><Translator compact/></section></div>}
    {panel==='history'&&<><div className="mobile-studio-history-toolbar"><span>Все сохранённые арты</span><button type="button" disabled={deleting||!jobs.length} onClick={onClear}><Trash2 size={14}/>Очистить всю историю</button></div><StudioHistory onDeleteMany={onDeleteMany} undo={undo} onRestore={onRestore} grid jobs={jobs} selected={frame?.job.id} deleting={deleting} onOpen={openFromHistory} onFavorite={onFavorite} onDelete={onDelete}/></>}
    {panel==='details'&&frame&&<div className="mobile-studio-art-info"><div className="mobile-studio-art-actions"><GenerationVideoContext.Provider value={animateFromSheet}><ArtAnimateButton imageId={frame.job.id}/></GenerationVideoContext.Provider><ArtUpscaleButton imageId={frame.job.id}/></div><StudioArtMetadata job={frame.job}/><Disclosure title="Промпт"><p>{frame.job.prompt}</p></Disclosure><Button variant="outline" className="mobile-studio-done" disabled={busy||!!pending||loop} onClick={()=>{onUse(frame.job);closePanel()}}><Repeat size={16}/>Повторить настройки</Button><Button variant="ghost" className="mobile-studio-delete-art" disabled={deleting} onClick={()=>{onDelete(frame.job);closePanel()}}><Trash2 size={16}/>Удалить арт</Button></div>}
   </motion.div></AnimatePresence></div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
 </>;
}
