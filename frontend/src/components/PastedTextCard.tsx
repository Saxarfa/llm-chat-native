import {HintButton} from './Hint';
import {useState} from 'react';
import {Pencil,X} from '../icons';
import {Button,Modal} from './primitives';

export function PastedTextCard({text,index,onChange,onRemove}:{text:string;index:number;onChange:(text:string)=>void;onRemove:()=>void}){
 const[editing,setEditing]=useState(false),[draft,setDraft]=useState(text);
 const edit=()=>{setDraft(text);setEditing(true)};
 return <>
  <div className="pasted-text-card">
   <HintButton className="pasted-text-remove" aria-label={`Удалить вставленный текст ${index+1}`} onClick={onRemove}><X size={12}/></HintButton>
   <button className="pasted-text-preview" aria-label={`Открыть вставленный текст ${index+1}`} onClick={edit}><span>{text}</span></button>
   <div className="pasted-text-footer"><span>ВСТАВЛЕНО</span><HintButton aria-label={`Редактировать вставленный текст ${index+1}`} onClick={edit}><Pencil size={14}/></HintButton></div>
  </div>
  <Modal open={editing} onClose={()=>setEditing(false)} title="Вставленный текст" description={`${text.length.toLocaleString('ru-RU')} символов · модели будет передан полный текст`} className="pasted-text-editor">
   <textarea aria-label="Текст вставки" value={draft} onChange={event=>setDraft(event.target.value)} spellCheck={false}/>
   <footer><Button variant="ghost" onClick={()=>setEditing(false)}>Отмена</Button><Button disabled={!draft.trim()} onClick={()=>{onChange(draft);setEditing(false)}}>Сохранить</Button></footer>
  </Modal>
 </>;
}
