import {HintButton} from './Hint';
import {useState} from 'react';
import {Check,ChevronDown,GitBranch,Loader2,Trash2} from '../icons';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from './ui/dropdown-menu';
import {failure,selectBranch,deleteBranch} from '../store';
import {Button,Modal} from './primitives';
import type {Chat,ChatBranch} from '../types';
import './branches.css';

export function BranchSwitcher({chat,locked}:{chat?:Chat;locked:boolean}){
 const[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[deleting,setDeleting]=useState<ChatBranch|null>(null),[confirmOpen,setConfirmOpen]=useState(false);
 if(!chat||!chat.branches||chat.branches.length<2)return null;
 const active=chat.branches.find(branch=>branch.id===chat.active_branch_id);
 const remove=async()=>{if(!deleting||busy||locked)return;setBusy(true);try{await deleteBranch(deleting.id);setConfirmOpen(false)}catch(error){failure(error)}finally{setBusy(false)}};
 return <><DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><HintButton className="branch-switcher" disabled={locked||busy} aria-label={`Ветки диалога: ${active?.name||'Основная'}`} hint={locked?'Переключение доступно после завершения ответа':undefined}>
  {busy?<Loader2 size={16} className="spin"/>:<GitBranch size={16}/>}<span>{active?.name||'Основная'}</span><ChevronDown size={12}/>
 </HintButton></DropdownMenuTrigger><DropdownMenuContent className="floating-panel branch-menu" align="start" sideOffset={8} onCloseAutoFocus={event=>{if(confirmOpen)event.preventDefault()}}>
  <div className="branch-menu-heading">Ветки диалога <span>{chat.branches.length}</span></div>
  {chat.branches.map(branch=><div className="branch-menu-row" key={branch.id} data-active={branch.id===chat.active_branch_id}><DropdownMenuItem className="branch-menu-select" disabled={busy||branch.id===chat.active_branch_id} onSelect={()=>{setBusy(true);void selectBranch(branch.id).catch(failure).finally(()=>setBusy(false))}}>
   <GitBranch size={14}/><span className="branch-menu-label"><strong>{branch.name}</strong><small>{branch.parent_id?`Из «${chat.branches?.find(item=>item.id===branch.parent_id)?.name||'Основная'}» · `:''}{branch.message_count} сообщ.</small></span>{branch.id===chat.active_branch_id&&<Check size={14}/>}
  </DropdownMenuItem><DropdownMenuItem asChild disabled={busy||locked} onSelect={()=>{setOpen(false);setDeleting(branch);setConfirmOpen(true)}}><HintButton type="button" className="branch-menu-delete" aria-label={`Удалить ветку «${branch.name}»`} disabled={busy||locked}><Trash2 size={14}/></HintButton></DropdownMenuItem></div>)}
 </DropdownMenuContent></DropdownMenu>
 <Modal open={confirmOpen} onClose={()=>{if(!busy)setConfirmOpen(false)}} persistent={busy} title={`Удалить ветку «${deleting?.name||''}»?`} description="Сообщения этой ветки будут удалены. Другие ветки, включая дочерние, сохранятся."><div className="confirm-actions"><Button variant="ghost" disabled={busy} onClick={()=>setConfirmOpen(false)}>Отмена</Button><Button variant="destructive" disabled={busy||locked} onClick={()=>void remove()}>{busy?<><Loader2 className="spin" size={14}/>Удаление…</>:'Удалить'}</Button></div></Modal>
 </>;
}
