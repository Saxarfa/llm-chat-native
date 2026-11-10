import {useRef,useState,type ReactNode} from 'react';
import {MoreHorizontal,Trash2,Volume2} from '../icons';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from './ui/dropdown-menu';
import {IconButton} from './primitives';
import {DeleteMessageDialog} from './DeleteMessageAction';
import {PinMessage} from './ChatContextPanel';
import {ReadAloud} from './ReadAloud';
import {useChatSelection} from '../store';

export function AnswerMoreActions({messageId,text,disabled,speechAllowed,children}:{messageId:string;text:string;disabled:boolean;speechAllowed:boolean;children?:ReactNode}){
 const[removing,setRemoving]=useState(false),[open,setOpen]=useState(false),[speaking,setSpeaking]=useState(false),anchor=useRef<HTMLButtonElement>(null),speech=useRef<((showPanel?:boolean)=>void)|null>(null),openingSpeech=useRef(false);
 const locked=useChatSelection(state=>open&&!!state.lives[state.active]),mutationsDisabled=disabled||locked;
 return <><DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><IconButton ref={anchor} label="Ещё действия с ответом" disabled={disabled}><MoreHorizontal size={16}/></IconButton></DropdownMenuTrigger><DropdownMenuContent className="floating-panel answer-more-menu" side="top" align="start" sideOffset={6} onCloseAutoFocus={event=>{if(removing||openingSpeech.current)event.preventDefault();if(openingSpeech.current){openingSpeech.current=false;setSpeaking(true)}}}>
  {speechAllowed&&<DropdownMenuItem disabled={disabled||!text.trim()} onSelect={()=>{openingSpeech.current=true;speech.current?.(false)}}><Volume2 size={14}/>Озвучить ответ</DropdownMenuItem>}
  <PinMessage messageId={messageId} disabled={mutationsDisabled} menu/>
  {children}
  <DropdownMenuItem className="destructive" disabled={mutationsDisabled} onSelect={()=>setRemoving(true)}><Trash2 size={14}/>Удалить ответ</DropdownMenuItem>
 </DropdownMenuContent></DropdownMenu>
 {speechAllowed&&<ReadAloud text={text} disabled={disabled} open={speaking} onOpenChange={setSpeaking} anchor={anchor} menuAction={speech}/>}
 <DeleteMessageDialog messageId={messageId} answer disabled={mutationsDisabled} open={removing} onOpenChange={setRemoving}/></>;
}
