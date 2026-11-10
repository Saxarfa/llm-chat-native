import {HintButton} from './Hint';
import {useRef,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {softTransition} from '../motion';
import {BookOpen,ChevronDown,Globe,ImagePlus,Loader2,Plus} from '../icons';
import {DropdownMenu,DropdownMenuCheckboxItem,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuSeparator,DropdownMenuTrigger} from './ui/dropdown-menu';
import {configFor,reasoningKind,subscriptionLevels,isNanoModel,isOmniModel} from '../domain';
import {triggerHaptic} from '../haptics';
import * as chat from '../store';
import type {State} from '../types';

function ToolSection({name,value,icon,choices,selected,onSelect}:{name:string;value:string;icon:React.ReactNode;choices:string[][];selected:string;onSelect:(value:string)=>void}){
 const [open,setOpen]=useState(false),reduced=useReducedMotion();
 return <>
  <DropdownMenuItem className="composer-tool-section" aria-expanded={open} onSelect={event=>{event.preventDefault();setOpen(!open)}}>
   {icon}<strong>{name}</strong><span className="composer-tool-value">{value}</span><ChevronDown size={14} className={open?'expanded':''}/>
  </DropdownMenuItem>
  <AnimatePresence initial={false}>{open&&<motion.div className="composer-tool-choices" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={softTransition(reduced)}>
   <DropdownMenuRadioGroup aria-label={name} value={selected} onValueChange={onSelect}>
    {choices.map(([id,label,note])=><DropdownMenuRadioItem indicator="check" key={id} value={id}><span><strong>{label}</strong>{note&&<small>{note}</small>}</span></DropdownMenuRadioItem>)}
   </DropdownMenuRadioGroup>
  </motion.div>}</AnimatePresence>
 </>;
}

function composerReasoning(state:State){
 const model=chat.activeModel(),kind=reasoningKind(model),config=configFor(model,state.settings,chat.overrides());
 const qwen=model==='qwen-3.8-27b-it',enabled=config.thinking??chat.overrides().thinking??true;
 const effort=qwen?(config.reasoning_effort||'xhigh'):(config.reasoning_strength||'high');
 const levels=subscriptionLevels(model)??(qwen?[['off','Без рассуждений'],['low','Лёгкие'],['medium','Средние'],['xhigh','Максимальные']]:kind==='toggle'?[['on','Включены'],['off','Выключены']]:[['low','Лёгкие'],['medium','Средние'],['high','Глубокие'],['xhigh','Максимальные']]);
 const selected=qwen?(enabled?effort:'off'):kind==='toggle'?(enabled?'on':'off'):effort;
 const setReasoning=(value:string)=>{
  triggerHaptic('selection');
  const patch=qwen?{thinking:value!=='off',reasoning_effort:value==='off'?effort:value}:kind==='toggle'?{thinking:value==='on'}:{reasoning_strength:value,...(model.startsWith('aistudio/')?{thinking:true}:{})};
  void chat.saveReasoning(model,patch).catch(chat.failure);
 };
 return {kind,levels,selected,setReasoning};
}

export function ComposerTools({state,onAttach,uploading,side='top'}:{state:State;onAttach:()=>void;uploading:boolean;side?:'top'|'bottom'}){
 const pointer=useRef(false),model=chat.activeModel(),nano=isNanoModel(model);
 const [savingMemory,setSavingMemory]=useState(false);
 const temporary=!!chat.currentChat()?.temporary;
 const memoryEnabled=!temporary&&state.settings.modelConfigs?.[model]?.memoryEnabled!==false;
 const setMemory=async(enabled:boolean)=>{triggerHaptic('selection');setSavingMemory(true);try{await chat.saveModelMemory(model,enabled)}catch(error){chat.failure(error)}finally{setSavingMemory(false)}};
 const mode=chat.overrides().searchMode??state.settings.searchMode??'disabled';
 const searchChoices=[['disabled','Выкл','Без обращения к интернету'],['auto','Авто','Модель сама решит, когда искать'],['forced','Всегда',(model.startsWith('aistudio/')||model.startsWith('gemini-web/'))?'Просить Google Search перед каждым ответом':'Поиск перед каждым ответом']];
 return <DropdownMenu modal={false}>
  <DropdownMenuTrigger asChild><HintButton className="icon-button attachment-trigger" aria-label="Инструменты и вложения" hint="Инструменты и вложения" onPointerDown={()=>{pointer.current=true}} onKeyDown={()=>{pointer.current=false}}>{uploading?<Loader2 className="spin" size={18}/>:<span className="composer-plus-glyph" aria-hidden="true"><Plus size={18} data-icon-motion="off"/></span>}</HintButton></DropdownMenuTrigger>
  <DropdownMenuContent animated={false} className="floating-panel composer-menu composer-tools-menu" side={side} align="start" sideOffset={10} collisionPadding={12} onEscapeKeyDown={()=>{pointer.current=false}} onCloseAutoFocus={event=>{if(pointer.current)event.preventDefault()}}>
   <DropdownMenuItem className="composer-attach-item" disabled={uploading} onSelect={onAttach}><ImagePlus size={18}/><span><strong>Прикрепить файл</strong><small>{isOmniModel(model)?'Картинка или MP4 до 24 МБ':nano?'PNG, JPEG или WebP — как образец':'MD, PDF, PNG, JPEG или WebP'}</small></span></DropdownMenuItem>
   {!nano&&<>
   <DropdownMenuSeparator/>
   <DropdownMenuLabel className="composer-tools-label">Для этого чата</DropdownMenuLabel>
   <ToolSection name={(model.startsWith('aistudio/')||model.startsWith('gemini-web/'))?'Google Search':'Веб-поиск'} value={searchChoices.find(c=>c[0]===mode)?.[1]||'Выкл'} icon={<Globe size={16}/>} choices={searchChoices} selected={mode} onSelect={value=>{triggerHaptic('selection');void chat.saveOverrides({...chat.overrides(),searchMode:value}).catch(chat.failure)}}/>
   <DropdownMenuSeparator/>
   <DropdownMenuLabel className="composer-tools-label">Для этой модели во всех чатах</DropdownMenuLabel>
   <DropdownMenuCheckboxItem className="composer-memory-toggle" checked={memoryEnabled} disabled={savingMemory||temporary} onSelect={event=>event.preventDefault()} onCheckedChange={value=>void setMemory(value===true)}>
    <BookOpen size={18}/><span className="composer-memory-description"><strong>Память модели</strong><small>{temporary?'Отключена во временном чате':memoryEnabled?'Доступ к сохранённым фактам разрешён':'Не читает и не изменяет сохранённые факты'}</small></span><span className="composer-memory-switch" data-checked={memoryEnabled} aria-hidden="true">{savingMemory?<Loader2 size={14} className="spin"/>:<span/>}</span>
   </DropdownMenuCheckboxItem>
   <p className="composer-memory-note">{temporary?'Переписка не читает и не изменяет постоянную память.':'Работает, если память включена в общих настройках.'}</p>
   </>}
  </DropdownMenuContent>
 </DropdownMenu>;
}

/** Uses the same model-scoped settings as the tools menu and profile panel. */
export function ComposerReasoning({state,side='top'}:{state:State;side?:'top'|'bottom'}){
 const {kind,levels,selected,setReasoning}=composerReasoning(state);
 if(!kind)return null;
 return <DropdownMenu modal={false}>
  <DropdownMenuTrigger asChild><button type="button" className="composer-reasoning-trigger" aria-label="Уровень рассуждений" title="Уровень рассуждений"><span>{levels.find(c=>c[0]===selected)?.[1]||'Максимальные'}</span></button></DropdownMenuTrigger>
  <DropdownMenuContent className="floating-panel composer-menu composer-reasoning-menu" side={side} align="end" sideOffset={8} collisionPadding={12}>
   <DropdownMenuLabel>Уровень рассуждений</DropdownMenuLabel>
   <DropdownMenuRadioGroup value={selected} onValueChange={setReasoning}>{levels.map(([id,label])=><DropdownMenuRadioItem indicator="check" key={id} value={id}>{label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup>
  </DropdownMenuContent>
 </DropdownMenu>;
}
