import {HintButton} from './Hint';
import type {Values} from '../types';
import {usePreparedPage} from '../usePreparedPage';
import {useSnapshotState} from '../useSnapshotState';
import {settingNumber} from '../settingNumber';
import {LoraControls} from './LoraControls';
import {CloudImagePreferences} from './ImageGeneratorSettings';
import type {StudioAIStudioConfig} from './studioTypes';
import {imageGenerationPreference} from '../imageGeneration';
import {Translator} from './Translator';
import {NumberInput} from './NumberInput';
import {Select,SelectOption} from './Select';
import {ImageResolutionOption,imageResolutionDisplay} from './ImageResolutionOption';
import {AnimatePresence,motion,useIsPresent} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {KnowledgePicker,KnowledgeSettings} from './KnowledgeSettings';
import {StateTransition} from './StateTransition';
import {ListPresence} from './ListPresence';
import {Reveal} from './Reveal';
import {memo,useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {BookOpen,Check,Copy,ImagePlus,Languages,Layers3,Loader2,MessageSquare,MoreHorizontal,Pencil,Plus,RefreshCw,Search,SlidersHorizontal,Trash2,Upload,X} from '../icons';
import {ImageModelOptions,imageModelName,imageModelAlignment} from './imageModels';
import {Avatar,Button,Disclosure,Modal} from './primitives';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from './ui/dropdown-menu';
import * as chat from '../store';
import {parameterSupported,modelName,reasoningKind,reasoningStrength,subscriptionLevels,studioOutputLimit} from '../domain';
import {clonePreset,normalizePreset,presetConfig,presetConflict,presetImagesForModel,presetPayload,validatePreset,type WorkspacePreset,type WorkspaceImageSettings} from '../workspacePresets';
import './Workspace.css';

export type {WorkspacePreset} from '../workspacePresets';
type ImageConfig={online:boolean;models:string[];samplers:string[];aistudio?:StudioAIStudioConfig};
type EditorTab='identity'|'model'|'images';
const parameters:[string,string,number,number,number][]=[
 ['temperature','Температура',0,2,.05],['top_p','Top-P',0,1,.05],['min_p','Min-P',0,1,.01],
 ['top_k','Top-K',0,1000,1],['repeat_penalty','Штраф за повторы',0,3,.05],['presence_penalty','Presence penalty',-2,2,.05],
 ['frequency_penalty','Frequency penalty',-2,2,.05]
];
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}){
 return <label className="workspace-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
}
function NumberField({label,value,min,max,step=1,onChange,disabled=false}:{label:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void;disabled?:boolean}){
 const [draft,setDraft]=useState(Number.isFinite(value)?String(value):'');
 const commit=()=>{const parsed=Number(draft);if(!draft.trim()||!Number.isFinite(parsed)||parsed<min||parsed>max)return;const next=settingNumber(parsed,step);setDraft(String(next));onChange(next)};
 useEffect(()=>setDraft(Number.isFinite(value)?String(value):''),[value]);
 return <Field label={label}><NumberInput type="number" aria-label={label} value={draft} min={min} max={max} step={step} required disabled={disabled} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}} onChange={event=>{const raw=event.target.value;setDraft(raw);onChange(raw===''?Number.NaN:Number(raw))}}/></Field>;
}
function Cover({src,name}:{src:string;name:string}){
 const [failedSrc,setFailedSrc]=useState(''),reduced=useReducedMotion(),revision=useRef({src,number:0});
 if(revision.current.src!==src)revision.current={src,number:revision.current.number+1};
 const image=src&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)&&failedSrc!==src;
 return <AnimatePresence initial={false}>{image?<motion.img key={`image-${revision.current.number}`} src={src} alt={`Обложка «${name||'Новый пресет'}»`} style={{position:'absolute',inset:0}} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.24}} onError={()=>setFailedSrc(src)}/>:<motion.span key="placeholder" className="workspace-cover-placeholder" aria-hidden="true" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.24}}><Layers3/></motion.span>}</AnimatePresence>;
}
function EditorTabExit({children}:{children:ReactNode}){
 const present=useIsPresent(),reduced=useReducedMotion();
 return <motion.div className="workspace-editor-tab-exit" inert={!present} aria-hidden={!present} initial={false} animate={{opacity:1}} exit={{opacity:0}} transition={{type:'tween',duration:reduced?0:.12,ease:[.23, 1, .32, 1]}}>{children}</motion.div>;
}
async function prepareCover(file:File){
 if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>12*1024*1024)throw new Error('Выберите PNG, JPEG, WebP или GIF до 12 МБ.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,960/image.width,960/image.height),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Не удалось подготовить обложку.');
  context.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.85);
 }finally{URL.revokeObjectURL(url)}
}
function PresetEditor({initial,presets,imageConfig,onSaved,onClose}:{initial:WorkspacePreset;presets:WorkspacePreset[];imageConfig:ImageConfig|null;onSaved:(preset:WorkspacePreset)=>void;onClose:()=>void}){
 const state=chat.useChatLayout(),[draft,setDraft]=useState<WorkspacePreset>(()=>structuredClone(initial)),baseline=useRef(JSON.stringify(initial));
 const reduced=useReducedMotion(),[closing,setClosing]=useState(false);
 const [tab,setTab]=useState<EditorTab>('identity'),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[confirmClose,setConfirmClose]=useState(false),[replaceConfig,setReplaceConfig]=useState(false),[conflicted,setConflicted]=useState(false);
 const [customSize,setCustomSize]=useState(!['512x512','1024x1024','832x1216','1216x832'].includes(`${initial.image_settings.width}x${initial.image_settings.height}`));
 const coverInput=useRef<HTMLInputElement>(null),form=useRef<HTMLFormElement>(null),request=useRef(0),formId=useId();
 const dirty=JSON.stringify(draft)!==baseline.current,conflict=!closing&&(conflicted||presetConflict(initial,presets));
 const models=[...new Set([draft.model_id,...state.models.map(model=>model.id),...Object.keys(state.settings.modelProfiles||{})])].filter(Boolean);
 const imageModels=[...new Set([draft.image_settings.model,...(imageConfig?.models||[])])].filter(Boolean),samplers=[...new Set([draft.image_settings.sampler,...(imageConfig?.samplers||[])])].filter(Boolean);
 const kind=reasoningKind(draft.model_id),qwen=draft.model_id==='qwen-3.8-27b-it';
 const change=(patch:Partial<WorkspacePreset>)=>setDraft(value=>({...value,...patch}));
 const config=(key:string,value:unknown)=>setDraft(preset=>({...preset,config:{...preset.config,[key]:value}}));
 const image=(patch:Partial<WorkspaceImageSettings>)=>setDraft(preset=>({...preset,image_settings:{...preset.image_settings,...patch}}));
 const finishClose=()=>{if(!closing)setClosing(true)};
 const close=()=>{if(saving||uploading||closing)return;if(dirty)setConfirmClose(true);else finishClose()};
 useEffect(()=>()=>{request.current++},[]);
 const upload=async(file:File)=>{const token=++request.current;setUploading(true);setError('');try{const value=await prepareCover(file);if(token===request.current)change({cover:value})}catch(e){if(token===request.current)setError(message(e))}finally{if(token===request.current)setUploading(false)}};
 const save=async(copy=false)=>{
  const invalid=validatePreset(draft);if(invalid){setTab(invalid.tab);setError(invalid.message);return}
  if(!copy&&conflict)return;
  setSaving(true);setError('');
  try{
   const payload=presetPayload(draft,window.storageManager.tabId,copy);
   const result=await chat.api(copy||!draft.id?'/api/workspace/presets':`/api/workspace/presets/${encodeURIComponent(draft.id)}`,copy||!draft.id?'POST':'PUT',payload);
   const saved=normalizePreset(result.preset);baseline.current=JSON.stringify(saved);setDraft(saved);onSaved(saved);finishClose();chat.notify(copy?'Копия пресета сохранена':'Пресет сохранён');
  }catch(e){
   let changed=false;
   if(draft.id)try{const latest=await chat.api('/api/workspace/presets');changed=presetConflict(initial,latest.presets);if(changed)setConflicted(true)}catch{}
   setError(changed?'Пресет уже изменён в другой вкладке. Ваши правки сохранены в форме — их можно сохранить отдельной копией.':message(e));
  }finally{setSaving(false)}
 };
 const switchTab=(next:EditorTab)=>{if(form.current&&!form.current.reportValidity())return false;setTab(next);return true};
 const imageSize=`${draft.image_settings.width}x${draft.image_settings.height}`;
 return <Modal open={!closing} onClose={close} onAfterClose={onClose} persistent title={initial.id?'Редактировать пресет':'Новый пресет'} className="workspace-editor">
  <div className="workspace-editor-tabs" role="tablist" aria-label="Настройки пресета">{([['identity','Основное',Layers3],['model','Модель',SlidersHorizontal],['images','Картинки',ImagePlus]] as const).map(([id,label,Icon])=><button key={id} id={`${formId}-${id}-tab`} role="tab" aria-selected={tab===id} aria-controls={`${formId}-${id}`} tabIndex={tab===id?0:-1} onClick={()=>switchTab(id)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const sections=['identity','model','images'] as const,index=sections.indexOf(tab);const next=event.key==='Home'?sections[0]:event.key==='End'?sections[2]:sections[(index+(event.key==='ArrowRight'?1:2))%3];if(switchTab(next))document.getElementById(`${formId}-${next}-tab`)?.focus()}}>{tab===id&&<motion.span className="workspace-tab-mark" layoutId={`${formId}-active-tab`} transition={{type:'tween',duration:reduced?0:.24,ease:[.23, 1, .32, 1]}}/>}<Icon size={16}/>{label}</button>)}</div>
  <form ref={form} id={formId} className="workspace-editor-form" inert={closing} onSubmit={event=>{event.preventDefault();void save()}}>
   {conflict&&<div className="workspace-conflict" role="status"><strong>Этот пресет изменился в другой вкладке</strong><span>Текущие правки не потеряны. Сохраните их копией или закройте форму и откройте актуальную версию.</span><button type="button" disabled={saving} onClick={()=>{if(form.current?.reportValidity())void save(true)}}><Copy size={14}/>Сохранить как копию</button></div>}
   <AnimatePresence mode="wait" initial={false}><EditorTabExit key={tab}><div role="tabpanel" id={`${formId}-${tab}`} aria-labelledby={`${formId}-${tab}-tab`} className="workspace-editor-panel">
   {tab==='identity'&&<>
    <div className="workspace-cover-editor"><Cover src={draft.cover} name={draft.name}/><div className="workspace-cover-editor-actions"><button type="button" disabled={uploading} onClick={()=>coverInput.current?.click()}><StateTransition className="is-icon" stateKey={uploading?'uploading':'ready'}>{uploading?<Loader2 size={14} className="spin"/>:<Upload size={14}/>}</StateTransition><StateTransition stateKey={draft.cover?'replace':'upload'}>{draft.cover?'Заменить обложку':'Загрузить обложку'}</StateTransition></button>{draft.cover&&<HintButton type="button" aria-label="Убрать обложку" onClick={()=>change({cover:''})}><X size={16}/></HintButton>}</div></div>
    <input ref={coverInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value=''}}/>
    <Field label="Название"><input autoComplete="off" maxLength={100} required value={draft.name} placeholder="Например, автор историй" onChange={event=>change({name:event.target.value})}/></Field>
    <Field label="Описание"><textarea rows={2} maxLength={2000} value={draft.description} placeholder="Для каких задач этот пресет" onChange={event=>change({description:event.target.value})}/></Field>
    <Field label="Приветствие"><textarea rows={2} maxLength={160} value={draft.greeting||''} placeholder="С чего начнём?" onChange={event=>change({greeting:event.target.value})}/><small>Заголовок на стартовом экране нового диалога с этим актёром.</small></Field>
    <Field label="Модель"><Select required value={draft.model_id} onChange={event=>change({model_id:event.target.value})}>{!draft.model_id&&<SelectOption value="">Выберите модель</SelectOption>}{models.map(id=><SelectOption key={id} value={id}>{modelName(id,state.settings)}</SelectOption>)}</Select></Field>
    <div className="workspace-model-hint"><StateTransition stateKey={draft.model_id}><Avatar name={modelName(draft.model_id,state.settings)} src={state.settings.modelProfiles?.[draft.model_id]?.avatar}/><span>{draft.model_id||'Сначала подключите модель в настройках сайта.'}</span></StateTransition></div>
    <p className="workspace-note">Пресет создаёт отдельный диалог со своими настройками. Общие профили моделей остаются прежними.</p>
   </>}
   {tab==='model'&&<>
    <div className="workspace-section-heading"><span><BookOpen size={16}/>Инструкции и поведение</span><button type="button" onClick={()=>setReplaceConfig(true)}><RefreshCw size={14}/>Из профиля</button></div>
    <Disclosure title="Базы знаний" className="workspace-disclosure"><KnowledgePicker value={draft.knowledge} onChange={knowledge=>change({knowledge})}/></Disclosure>
    <Field label="Системный промпт"><textarea className="workspace-system-prompt" maxLength={64000} value={draft.config.systemPrompt||''} placeholder="Роль, стиль ответов и правила для модели" onChange={event=>config('systemPrompt',event.target.value)}/></Field>
    <div className="workspace-pair">
     <Field label="Веб-поиск"><Select value={draft.config.searchMode||'disabled'} onChange={event=>config('searchMode',event.target.value)}><SelectOption value="disabled">Выключен</SelectOption><SelectOption value="auto">Авто</SelectOption><SelectOption value="forced">Всегда</SelectOption></Select></Field>
     {kind&&<Field label="Рассуждения"><Select value={qwen?(draft.config.thinking===false?'off':draft.config.reasoning_effort||'xhigh'):kind==='toggle'?(draft.config.thinking===false?'off':'on'):reasoningStrength(draft.model_id,draft.config)} onChange={event=>{const value=event.target.value;if(qwen)change({config:{...draft.config,thinking:value!=='off',reasoning_effort:value==='off'?draft.config.reasoning_effort||'xhigh':value}});else if(draft.model_id.startsWith('aistudio/'))change({config:{...draft.config,thinking:true,reasoning_strength:value}});else config(kind==='toggle'?'thinking':'reasoning_strength',kind==='toggle'?value==='on':value)}}>{subscriptionLevels(draft.model_id)?.map(([value,label])=><SelectOption key={value} value={value}>{label}</SelectOption>)??(kind==='toggle'&&!qwen?<><SelectOption value="on">Включены</SelectOption><SelectOption value="off">Выключены</SelectOption></>:<>{qwen&&<SelectOption value="off">Без рассуждений</SelectOption>}<SelectOption value="low">Лёгкие</SelectOption><SelectOption value="medium">Средние</SelectOption>{!qwen&&<SelectOption value="high">Глубокие</SelectOption>}<SelectOption value="xhigh">Максимальные</SelectOption></>)}</Select></Field>}
    </div>
    {!draft.model_id.startsWith('google-subscription/')&&!draft.model_id.startsWith('gemini-web/')&&<><div className="workspace-section-heading"><span><SlidersHorizontal size={16}/>Параметры ответа</span></div>
    <div className="workspace-pair">{parameters.slice(0,3).filter(([key])=>parameterSupported(draft.model_id,key)).map(([key,label,min,max,step])=><NumberField key={key} label={label} value={draft.config[key]} min={min} max={max} step={step} onChange={value=>config(key,value)}/>)}<NumberField label="Токены ответа" value={draft.config.max_tokens===-1?2048:draft.config.max_tokens} min={1} max={draft.model_id.startsWith('aistudio/')?studioOutputLimit(draft.model_id):1048576} disabled={draft.config.max_tokens===-1} onChange={value=>config('max_tokens',value)}/></div>
    <label className="workspace-check"><input type="checkbox" checked={draft.config.max_tokens===-1} onChange={event=>config('max_tokens',event.target.checked?-1:2048)}/><span>Максимальная длина, доступная серверу</span></label>
    <Disclosure title="Расширенные параметры" className="workspace-disclosure"><div className="workspace-pair">{parameters.slice(3).filter(([key])=>parameterSupported(draft.model_id,key)).map(([key,label,min,max,step])=><NumberField key={key} label={label} value={draft.config[key]} min={min} max={max} step={step} onChange={value=>config(key,value)}/>)}</div></Disclosure></>}
   </>}
   {tab==='images'&&<>
    <p className="workspace-note workspace-note-top">Когда модель создаёт арт в этом диалоге, она пишет промпт, а параметры берёт из пресета.</p>
    <Field label="Источник изображений"><Select aria-label="Источник изображений актёра" value={draft.image_settings.source||'local'} onChange={event=>image({source:event.target.value as 'local'|'aistudio'})}><SelectOption value="local">Локальные</SelectOption><SelectOption value="aistudio">Nano Banana</SelectOption></Select></Field>
    {draft.image_settings.source==='aistudio'?<CloudImagePreferences aspectRatio={draft.image_settings.aspect_ratio||'auto'} imageSize={draft.image_settings.image_size||'1K'} allowAuto4k={draft.image_settings.allow_auto_4k} onChange={image} config={imageConfig?.aistudio}/>:<>
    {imageConfig?.online===false&&<p className="workspace-service-note">ComfyUI сейчас недоступен. Сохранённые настройки можно редактировать.</p>}
    <Field label="Чекпоинт"><Select required value={draft.image_settings.model} displayValue={imageModelName(draft.image_settings.model)} onChange={event=>image({model:event.target.value})}><ImageModelOptions models={imageModels}/></Select></Field>
    <Field label="Разрешение"><Select value={customSize?'custom':imageSize} displayValue={imageResolutionDisplay(customSize?'custom':imageSize)} onChange={event=>{setCustomSize(event.target.value==='custom');if(event.target.value!=='custom'){const [width,height]=event.target.value.split('x').map(Number);image({width,height})}}}><ImageResolutionOption value="512x512" label="Квадрат" width={512} height={512}/><ImageResolutionOption value="1024x1024" label="Квадрат" width={1024} height={1024}/><ImageResolutionOption value="832x1216" label="Портрет" width={832} height={1216}/><ImageResolutionOption value="1216x832" label="Альбом" width={1216} height={832}/><ImageResolutionOption value="custom" label="Своё разрешение" custom/></Select></Field>
    <Reveal show={customSize}><div className="workspace-pair"><NumberField label="Ширина" value={draft.image_settings.width} min={256} max={4096} step={imageModelAlignment(draft.image_settings.model)} onChange={width=>image({width})}/><NumberField label="Высота" value={draft.image_settings.height} min={256} max={4096} step={imageModelAlignment(draft.image_settings.model)} onChange={height=>image({height})}/></div></Reveal>
    <div className="workspace-pair"><NumberField label="Шаги" value={draft.image_settings.steps} min={1} max={80} onChange={steps=>image({steps})}/><NumberField label="CFG" value={draft.image_settings.cfg} min={0} max={20} step={.1} onChange={cfg=>image({cfg})}/></div>
    <Field label="Семплер"><Select value={draft.image_settings.sampler} onChange={event=>image({sampler:event.target.value})}>{samplers.map(name=><SelectOption value={name} key={name}>{name}</SelectOption>)}</Select></Field>
    <Disclosure title="Дополнительные настройки" className="workspace-disclosure"><Field label="Негативный промпт"><textarea maxLength={16000} rows={4} value={draft.image_settings.negative} onChange={event=>image({negative:event.target.value})}/></Field><NumberField label="Seed" value={draft.image_settings.seed} min={-1} max={9007199254740991} onChange={seed=>image({seed})}/><p className="workspace-note">−1 — новый случайный seed для каждого арта.</p></Disclosure>
    <LoraControls model={draft.image_settings.model} value={draft.image_settings.loras} onChange={loras=>image({loras})}/>
    </>}
   </>}
   </div></EditorTabExit></AnimatePresence>
  </form>
  <Reveal show={!!error}><p className="workspace-error workspace-editor-error" role="alert">{error}</p></Reveal>
  <footer className="workspace-editor-footer"><span><StateTransition stateKey={dirty?'dirty':'clean'}>{dirty?'Есть изменения':'Настройки пресета'}</StateTransition></span><Button variant="ghost" disabled={saving||uploading||closing} onClick={close}>Отмена</Button><Button type="submit" form={formId} disabled={saving||uploading||conflict||closing}><StateTransition className="is-icon" stateKey={saving?'saving':'ready'}>{saving?<Loader2 size={14} className="spin"/>:<Check size={14}/>}</StateTransition>Сохранить</Button></footer>
  <Modal open={confirmClose&&!closing} onClose={()=>setConfirmClose(false)} title="Закрыть без сохранения?" description="Несохранённые изменения этого пресета будут потеряны."><div className="confirm-actions"><Button variant="ghost" onClick={()=>setConfirmClose(false)}>Продолжить</Button><Button onClick={()=>{setConfirmClose(false);finishClose()}}>Закрыть</Button></div></Modal>
  <Modal open={replaceConfig} onClose={()=>setReplaceConfig(false)} title="Взять параметры профиля?" description="Инструкции и параметры ответа в этой форме заменятся текущими настройками выбранной модели."><div className="confirm-actions"><Button variant="ghost" onClick={()=>setReplaceConfig(false)}>Отмена</Button><Button onClick={()=>{change({config:presetConfig(draft.model_id,state.settings)});setReplaceConfig(false)}}>Применить</Button></div></Modal>
 </Modal>;
}

const PresetCard=memo(function PresetCard({preset,settings,busy,starting,onEdit,onDelete,onStart}:{preset:WorkspacePreset;settings:Values;busy:boolean;starting:boolean;onEdit:(p:WorkspacePreset)=>void;onDelete:(p:WorkspacePreset)=>void;onStart:(p:WorkspacePreset)=>void|Promise<void>}){
 return <article className="workspace-card">
   <button className="workspace-card-cover" aria-label={`Редактировать пресет «${preset.name}»`} onClick={()=>onEdit(preset)}><Cover src={preset.cover} name={preset.name}/><span className="workspace-cover-edit"><Pencil size={14}/>Настроить</span></button>
   <div className="workspace-card-body"><div className="workspace-card-heading"><h2>{preset.name}</h2><DropdownMenu><DropdownMenuTrigger asChild><HintButton className="workspace-card-menu icon-button" aria-label={`Действия с пресетом «${preset.name}»`}><MoreHorizontal size={18}/></HintButton></DropdownMenuTrigger><DropdownMenuContent className="floating-panel" align="end"><DropdownMenuItem onSelect={()=>onEdit(preset)}><Pencil size={14}/>Редактировать</DropdownMenuItem><DropdownMenuItem onSelect={()=>onEdit(clonePreset(preset))}><Copy size={14}/>Создать копию</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="destructive" onSelect={()=>onDelete(preset)}><Trash2 size={14}/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    <div className="workspace-card-model"><Avatar name={modelName(preset.model_id,settings)} src={settings.modelProfiles?.[preset.model_id]?.avatar}/><span>{modelName(preset.model_id,settings)}</span></div>
    <p className="workspace-card-description">{preset.description||'Собственные инструкции и параметры модели.'}</p>
    <div className="workspace-card-summary"><span><ImagePlus size={12}/>{preset.image_settings.source==='aistudio'?`Nano Banana · ${preset.image_settings.image_size||'1K'}`:`${preset.image_settings.width} × ${preset.image_settings.height}`}</span>{preset.config.searchMode!=='disabled'&&preset.config.searchMode&&<span>Веб-поиск</span>}</div>
    <Button className="workspace-start" variant="outline" disabled={!!busy} onClick={()=>void onStart(preset)}><StateTransition className="is-icon" stateKey={starting?'starting':'ready'}>{starting?<Loader2 className="spin" size={14}/>:<MessageSquare size={14}/>}</StateTransition>Начать диалог</Button>
   </div>
  </article>;
});

export default function Workspace({onStart,active=true,onReady}:{onStart:(preset:WorkspacePreset)=>Promise<void>|void;active?:boolean;onReady?:(error?:string)=>void}){
 const state=chat.useChatLayout(),[presets,setPresets]=useSnapshotState<WorkspacePreset[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[editor,setEditor]=useState<WorkspacePreset|null>(null),[deleting,setDeleting]=useState<WorkspacePreset|null>(null),[busy,setBusy]=useState(''),[imageConfig,setImageConfig]=useState<ImageConfig|null>(null);
 const sectionKey=`llm-workspace-section-${state.user?.id||'local'}`;
 const [initialSection]=useState<'actors'|'knowledge'|'translator'>(()=>{try{const saved=localStorage.getItem(sectionKey);return saved==='knowledge'||saved==='translator'?saved:'actors'}catch{return 'actors'}});
 const {page:section,pending:sectionRequest,request:requestSection,ready:sectionReady,cancel:cancelSection}=usePreparedPage(initialSection);
 const preparingSection=sectionRequest?.status==='loading'?sectionRequest.target:undefined;
 const [pendingSectionVisible,setPendingSectionVisible]=useState('');
 useEffect(()=>{setPendingSectionVisible('');if(!preparingSection)return;const timer=setTimeout(()=>setPendingSectionVisible(preparingSection),250);return()=>clearTimeout(timer)},[preparingSection]);
 const sectionId=useId(),[knowledgeVisited,setKnowledgeVisited]=useState(section==='knowledge');
 const [knowledgeReady,setKnowledgeReady]=useState(false),notifyReady=useRef(onReady),readinessError=useRef('');notifyReady.current=onReady;
 useEffect(()=>{if(section==='knowledge'||preparingSection==='knowledge')setKnowledgeVisited(true)},[section,preparingSection]);
 useEffect(()=>{if(!active)cancelSection()},[active,cancelSection]);
 useLayoutEffect(()=>{if(!sectionRequest||sectionRequest.status!=='loading')return;if(sectionRequest.target==='translator'||sectionRequest.target==='actors'&&ready||sectionRequest.target==='knowledge'&&knowledgeReady)sectionReady(sectionRequest.id)},[sectionRequest,sectionReady,ready,knowledgeReady]);
 useEffect(()=>{try{localStorage.setItem(sectionKey,section)}catch{}},[sectionKey,section]);
 const loadSequence=useRef(0),alive=useRef(true);
 const refresh=useCallback(async()=>{const sequence=++loadSequence.current;try{const data=await chat.api('/api/workspace/presets');if(alive.current&&sequence===loadSequence.current){setPresets(data.presets.map(normalizePreset));setReady(true);readinessError.current='';setError('')}}catch(e){if(alive.current&&sequence===loadSequence.current){readinessError.current=message(e);setError(readinessError.current)}}},[]);
 useEffect(()=>{
  alive.current=active;if(!active)return;
  // A retained shell can still contain the previous attempt's error. Only a
  // failure received during this activation may reject its preparation.
  readinessError.current='';setError('');void refresh();
  let imageAlive=true;void chat.api('/api/images/config').then(configuration=>{if(alive.current&&imageAlive)setImageConfig(configuration)}).catch(()=>{});
  const update=()=>void refresh(),visible=()=>{if(document.visibilityState==='visible')void refresh()};
  window.addEventListener('workspace-presets-updated',update);window.addEventListener('online',update);document.addEventListener('visibilitychange',visible);
  return()=>{alive.current=false;imageAlive=false;loadSequence.current++;window.removeEventListener('workspace-presets-updated',update);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',visible)};
 },[refresh,active]);
 useEffect(()=>{if(preparingSection==='actors'&&!ready){readinessError.current='';setError('');void refresh()}},[sectionRequest?.id,preparingSection,ready,refresh]);
 useEffect(()=>{if(sectionRequest?.status==='loading'&&sectionRequest.target==='actors'&&readinessError.current)sectionReady(sectionRequest.id,readinessError.current)},[sectionRequest,sectionReady,error]);
 useEffect(()=>{if(!active)return;if(section==='translator'||section==='actors'&&ready||section==='knowledge'&&knowledgeReady)notifyReady.current?.();else if(section==='actors'&&readinessError.current)notifyReady.current?.(readinessError.current)},[active,section,ready,knowledgeReady,error]);
 const create=async()=>{if(busy)return;const owner=state.user?.id,currentAccount=()=>chat.getState().user?.id===owner,model=chat.activeModel()||state.models[0]?.id||'',preference=imageGenerationPreference(state.settings.modelConfigs?.[model]?.imageGeneration);setBusy('create');try{const local=await chat.api(`/api/images/settings${preference.source==='local'?`?model=${encodeURIComponent(preference.local_model)}`:''}`);if(alive.current&&currentAccount())setEditor({id:'',name:'',description:'',cover:'',model_id:model,version:0,config:presetConfig(model,state.settings),image_settings:presetImagesForModel(model,state.settings,local.values)})}catch(e){if(alive.current&&currentAccount())setError(message(e))}finally{if(alive.current&&currentAccount())setBusy('')}};
 const saved=(preset:WorkspacePreset)=>{setPresets(values=>[preset,...values.filter(value=>value.id!==preset.id)]);void refresh()};
 const start=useCallback(async(preset:WorkspacePreset)=>{setBusy(preset.id);setError('');try{await onStart(preset)}catch(e){setError(message(e))}finally{setBusy('')}},[onStart]);
 const remove=async()=>{if(!deleting)return;setBusy(`delete-${deleting.id}`);try{await chat.api(`/api/workspace/presets/${encodeURIComponent(deleting.id)}?version=${deleting.version}&source_tab=${encodeURIComponent(window.storageManager.tabId)}`,'DELETE');setPresets(values=>values.filter(value=>value.id!==deleting.id));setDeleting(null);chat.notify('Пресет удалён')}catch(e){setError(message(e));setDeleting(null);void refresh()}finally{setBusy('')}};
 const filtered=presets.filter(preset=>`${preset.name} ${preset.description} ${modelName(preset.model_id,state.settings)}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <section className="workspace-page" aria-label="Актёры и пресеты"><div className="workspace-content">
  <header className="workspace-heading"><div><span className="workspace-eyebrow">Твои модели, твои сценарии</span><h1>Актёры и пресеты</h1><p>Актёры и материалы для твоих диалогов.</p></div></header>
  <div className="workspace-sections" role="tablist" aria-label="Разделы рабочего пространства">{([['actors','Актёры',Layers3],['knowledge','Базы знаний',BookOpen],['translator','Переводчик',Languages]] as const).map(([id,label,Icon])=><button key={id} id={`${sectionId}-${id}-tab`} type="button" role="tab" aria-selected={section===id} aria-busy={preparingSection===id} aria-controls={`${sectionId}-${id}-panel`} tabIndex={section===id?0:-1} onClick={()=>void requestSection(id)} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const sections=['actors','knowledge','translator'] as const,index=sections.indexOf(preparingSection||section);const next=event.key==='Home'?sections[0]:event.key==='End'?sections[2]:sections[(index+(event.key==='ArrowRight'?1:2))%3];void requestSection(next);document.getElementById(`${sectionId}-${next}-tab`)?.focus()}}><Icon size={16}/><span>{label}</span>{pendingSectionVisible===id&&<Loader2 size={14} className="spin" aria-label="Открывается"/>}</button>)}</div>
  {sectionRequest?.status==='error'&&<div className="workspace-error workspace-load-error" role="alert"><span>{sectionRequest.error}</span><button onClick={()=>void requestSection(sectionRequest.target)}><RefreshCw size={14}/>Повторить</button></div>}
  <div className="workspace-panels">
  <div id={`${sectionId}-actors-panel`} role="tabpanel" aria-labelledby={`${sectionId}-actors-tab`} hidden={section!=='actors'&&preparingSection!=='actors'} inert={section!=='actors'} aria-hidden={section!=='actors'} data-preparing={section!=='actors'&&preparingSection==='actors'||undefined} className="workspace-section-panel">
  {error&&<div className="workspace-error workspace-load-error" role="alert"><span>{error}</span><button onClick={()=>void refresh()}><RefreshCw size={14}/>Повторить</button></div>}
  {!ready&&!error&&<div className="workspace-library-placeholder" role="status" aria-label="Загрузка пресетов" aria-busy="true"><span/><span/><span/></div>}
  {ready&&presets.length>0&&<div className="workspace-library-heading"><span>Пресеты <small>{presets.length}</small></span><label className="workspace-search"><Search size={16}/><input aria-label="Найти пресет" placeholder="Найти пресет" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<HintButton aria-label="Очистить поиск" onClick={()=>setQuery('')}><X size={14}/></HintButton>}</label></div>}
  {ready&&presets.length>0&&filtered.length===0&&<div className="workspace-no-results">Нет пресетов по этому запросу.</div>}
  <div className="workspace-grid"><AnimatePresence initial={false}>{active&&filtered.map(preset=><ListPresence className="workspace-grid-item" enter={false} key={preset.id}><PresetCard preset={preset} settings={state.settings} busy={!!busy} starting={busy===preset.id} onEdit={setEditor} onDelete={setDeleting} onStart={start}/></ListPresence>)}{ready&&<ListPresence className="workspace-grid-item" enter={false} key="create-preset"><button type="button" className="workspace-card workspace-create-card" disabled={!!busy} onClick={()=>void create()}><span className="workspace-create-symbol"><Plus size={28}/></span><strong>Создать пресет</strong><span>Новый актёр или настройки модели</span></button></ListPresence>}</AnimatePresence></div>
  </div>
  <div id={`${sectionId}-knowledge-panel`} role="tabpanel" aria-labelledby={`${sectionId}-knowledge-tab`} hidden={section!=='knowledge'&&preparingSection!=='knowledge'} inert={section!=='knowledge'} aria-hidden={section!=='knowledge'} data-preparing={section!=='knowledge'&&preparingSection==='knowledge'||undefined} className="workspace-section-panel workspace-knowledge">{(section==='knowledge'||preparingSection==='knowledge'||knowledgeVisited)&&<KnowledgeSettings active={active&&(section==='knowledge'||preparingSection==='knowledge')} onReady={failure=>{if(sectionRequest?.status==='loading'&&sectionRequest.target==='knowledge')sectionReady(sectionRequest.id,failure);if(failure){if(section==='knowledge')notifyReady.current?.(failure)}else{setKnowledgeReady(true);if(section==='knowledge')notifyReady.current?.()}}}/>}</div>
  <div id={`${sectionId}-translator-panel`} role="tabpanel" aria-labelledby={`${sectionId}-translator-tab`} hidden={section!=='translator'} className="workspace-section-panel"><Translator/></div>
  </div>
 </div>
 {editor&&<PresetEditor key={editor.id||`new-${editor.name}`} initial={editor} presets={presets} imageConfig={imageConfig} onSaved={saved} onClose={()=>setEditor(null)}/>}
 <Modal open={!!deleting} onClose={()=>{if(!busy)setDeleting(null)}} persistent title="Удалить пресет?" description={`«${deleting?.name||''}» исчезнет из рабочего пространства. Созданные с ним диалоги и их настройки сохранятся.`}><div className="confirm-actions"><Button variant="ghost" disabled={!!busy} onClick={()=>setDeleting(null)}>Отмена</Button><Button disabled={!!busy} onClick={()=>void remove()}>{busy?<Loader2 className="spin" size={14}/>:<Trash2 size={14}/>}Удалить</Button></div></Modal>
 </section>;
}
