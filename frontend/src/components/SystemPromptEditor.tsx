import {useSettingsScope} from './SettingsScope';
import {useId,useState} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {Check,ChartNoAxesCombined,Code2,Feather,GraduationCap,Image,Languages,Search,Sparkles,Undo2,type IconComponent} from '../icons';
import {Button,CopyButton,Disclosure} from './primitives';
import {matchingSystemPreset,systemPromptPresets,type SystemPromptPreset} from '../systemPromptPresets';
import './SystemPromptEditor.css';

const icons:Record<SystemPromptPreset['id'],IconComponent>={general:Sparkles,analyst:ChartNoAxesCombined,researcher:Search,storyteller:Feather,programmer:Code2,'image-prompts':Image,translator:Languages,tutor:GraduationCap};

export function SystemPromptEditor({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const settingsScope=useSettingsScope();
 const [selected,setSelected]=useState<string|null>(null),[undo,setUndo]=useState<{before:string;applied:string}|null>(null);
 const id=useId(),reduced=useReducedMotion();
 const preview=systemPromptPresets.find(p=>p.id===selected),active=matchingSystemPreset(value);
 const canUndo=undo!==null&&value===undo.applied;
 return <div className="system-prompt-editor">
  <div className="prompt-library-heading"><div><span className="prompt-eyebrow">Библиотека инструкций</span><p>Выберите характер работы модели</p></div><span className="prompt-language">EN</span></div>
  <div className="prompt-preset-grid" role="group" aria-label="Пресеты системного промпта">
   {systemPromptPresets.map(preset=>{const Icon=icons[preset.id];return <button type="button" key={preset.id} disabled={disabled} className="prompt-preset-card" aria-pressed={selected===preset.id} onClick={()=>setSelected(selected===preset.id?null:preset.id)}>
    <span className="prompt-preset-icon"><Icon size={18}/></span><span className="prompt-preset-copy"><strong>{preset.title}</strong><small>{preset.description}</small></span><span className="prompt-preset-check">{active?.id===preset.id&&<Check size={14} aria-label="Текущий промпт"/>}</span>
   </button>})}
  </div>
  <AnimatePresence initial={false}>
   {preview&&<motion.div key="preview" className="prompt-preview-clip" initial={settingsScope?{opacity:0}:{height:0,opacity:0}} animate={settingsScope?{opacity:1}:{height:'auto',opacity:1}} exit={settingsScope?{opacity:0,transition:{duration:reduced?0:.15,ease:'easeOut'}}:{height:0,opacity:0}} transition={{duration:reduced?0:.2,ease:[.23, 1, .32, 1]}}>
    <div className="prompt-preset-preview"><div className="prompt-preview-summary"><div key={preview.id} className="prompt-preview-description"><strong>{preview.title}</strong><p>{preview.detail}</p></div><Button type="button" variant="outline" disabled={disabled||value===preview.prompt} onClick={()=>{setUndo({before:value,applied:preview.prompt});onChange(preview.prompt);setSelected(null)}}>{value===preview.prompt?<><Check size={14}/>Применён</>:'Применить'}</Button></div>
     <Disclosure title="Посмотреть промпт" className="prompt-preview-disclosure"><div className="prompt-preview-tools"><span>Инструкции на английском</span><CopyButton text={preview.prompt} label="Скопировать пресет"/></div><div className="prompt-preview-text" lang="en" tabIndex={0} aria-label={`Текст пресета «${preview.title}»`}>{preview.prompt}</div></Disclosure>
     <small className="prompt-apply-hint">Применение заменит текст ниже. Сохранение — по кнопке «Сохранить профиль».</small>
    </div>
   </motion.div>}
  </AnimatePresence>
  <div className="prompt-current-heading"><label htmlFor={id}>Системный промпт</label><span className="prompt-current-kind" aria-live="polite">{active?.title||'Свой промпт'}</span></div>
  <textarea id={id} className="prompt-textarea large prompt-current-text" value={value} disabled={disabled} spellCheck={false} onChange={e=>onChange(e.target.value)} aria-describedby={`${id}-hint`}/>
  <div className="prompt-editor-footnote"><small id={`${id}-hint`}>Можно редактировать. Действует для этой модели; в отдельном чате инструкции можно переопределить.</small>{canUndo&&<button type="button" className="prompt-undo" disabled={disabled} onClick={()=>{onChange(undo.before);setUndo(null)}}><Undo2 size={14}/>Вернуть предыдущий</button>}</div>
 </div>;
}
