import {useState} from 'react';
import {Loader2,Trash2} from '../icons';
import {Button,IconButton,Modal} from './primitives';
import {deleteMessage,failure,useChatSelection} from '../store';

export function DeleteMessageAction({messageId,answer=false,disabled=false}:{messageId:string;answer?:boolean;disabled?:boolean}){
 const[open,setOpen]=useState(false);
 return <><IconButton className="message-delete" label={answer?'Удалить ответ':'Удалить сообщение'} disabled={disabled} onClick={()=>setOpen(true)}><Trash2 size={14}/></IconButton><DeleteMessageDialog messageId={messageId} answer={answer} disabled={disabled} open={open} onOpenChange={setOpen}/></>;
}
export function DeleteMessageDialog({messageId,answer=false,disabled=false,open,onOpenChange}:{messageId:string;answer?:boolean;disabled?:boolean;open:boolean;onOpenChange:(open:boolean)=>void}){
 const[busy,setBusy]=useState(false);
 const locked=useChatSelection(state=>open&&!!state.lives[state.active]);disabled=disabled||locked;
 const remove=async()=>{if(busy||disabled)return;setBusy(true);try{await deleteMessage(messageId);onOpenChange(false)}catch(error){failure(error)}finally{setBusy(false)}};
 return <Modal open={open} onClose={()=>{if(!busy)onOpenChange(false)}} persistent={busy} title={answer?'Удалить ответ?':'Удалить сообщение?'} description="Удалится только это сообщение в текущей ветке. Остальные сообщения и другие ветки сохранятся.">
   <div className="confirm-actions"><Button variant="ghost" disabled={busy} onClick={()=>onOpenChange(false)}>Отмена</Button><Button variant="destructive" disabled={busy||disabled} onClick={()=>void remove()}>{busy?<><Loader2 className="spin" size={14}/>Удаление…</>:'Удалить'}</Button></div>
  </Modal>;
}
