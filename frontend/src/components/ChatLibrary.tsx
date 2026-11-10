import {useEffect,useState} from 'react';
import {FolderPlus,Folder,Loader2,Pencil,RotateCcw,Trash2,Check,X} from '../icons';
import {Button,IconButton,Modal} from './primitives';
import {Select,SelectOption} from './Select';
import {api,failure,metadata,restoreChat} from '../store';
import type {Chat,ChatFolder} from '../types';
import './ChatLibrary.css';

export function FolderDialog({open,onClose,folders,onChange}:{open:boolean;onClose:()=>void;folders:ChatFolder[];onChange:()=>void}){
 const[name,setName]=useState(''),[editing,setEditing]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const act=async(task:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await task();onChange()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 const save=()=>act(async()=>{await api(editing?`/api/folders/${editing}`:'/api/folders',editing?'PATCH':'POST',{name:name.trim()});setName('');setEditing('')});
 return <Modal open={open} onClose={onClose} title="Папки диалогов" description="Удаление папки сохранит её диалоги в общем списке." className="chat-library-modal">
  <form className="folder-create" onSubmit={e=>{e.preventDefault();void save()}}><input aria-label="Название папки" placeholder="Название папки" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/><IconButton label={editing?'Сохранить название':'Создать папку'} disabled={busy||!name.trim()} type="submit">{busy?<Loader2 className="spin" size={16}/>:editing?<Check size={16}/>:<FolderPlus size={16}/>}</IconButton>{editing&&<IconButton label="Отменить переименование" onClick={()=>{setEditing('');setName('')}}><X size={16}/></IconButton>}</form>
  <div className="library-rows">{folders.map(folder=><div className="folder-library-row" key={folder.id}><Folder size={16}/><span>{folder.name}</span><IconButton label={`Переименовать папку ${folder.name}`} disabled={busy} onClick={()=>{setEditing(folder.id);setName(folder.name)}}><Pencil size={14}/></IconButton><IconButton label={`Удалить папку ${folder.name}`} disabled={busy} onClick={()=>void act(()=>api(`/api/folders/${folder.id}`,'DELETE'))}><Trash2 size={14}/></IconButton></div>)}</div>
  {!folders.length&&<p className="library-empty">Создай папки для работы, персонажей или промптов.</p>}{error&&<p role="alert" className="library-error">{error}</p>}
 </Modal>;
}

export function MoveChatDialog({item,onClose,folders}:{item:Chat|null;onClose:()=>void;folders:ChatFolder[]}){
 const[folder,setFolder]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(item)setFolder(item.folder_id||'')},[item]);
 return <Modal open={!!item} onClose={onClose} title="Переместить диалог" description={item?.title} className="chat-library-modal"><Select aria-label="Папка диалога" value={folder} onChange={e=>setFolder(e.target.value)}><SelectOption value="">Без папки</SelectOption>{folders.map(f=><SelectOption key={f.id} value={f.id}>{f.name}</SelectOption>)}</Select><div className="confirm-actions"><Button variant="ghost" onClick={onClose}>Отмена</Button><Button disabled={busy} onClick={()=>{if(!item)return;setBusy(true);void metadata(item.id,{folder_id:folder||null}).then(onClose).catch(failure).finally(()=>setBusy(false))}}>{busy?<Loader2 size={14} className="spin"/>:'Переместить'}</Button></div></Modal>;
}

export function TrashDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 const[items,setItems]=useState<Chat[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[purging,setPurging]=useState<Chat|null>(null);
 useEffect(()=>{
  if(!open)return;let alive=true,revision=0;
  const load=()=>{const ticket=++revision;void api('/api/chats/trash').then(d=>{if(alive&&ticket===revision){setItems(d.chats);setError('')}}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)})};
  setLoading(true);load();window.addEventListener('chat-trash-updated',load);
  return()=>{alive=false;window.removeEventListener('chat-trash-updated',load)};
 },[open]);
 const act=async(item:Chat,purge=false)=>{setBusy(item.id);setError('');try{if(purge)await api(`/api/chats/trash/${item.id}`,'DELETE');else await restoreChat(item.id);setItems(v=>v.filter(c=>c.id!==item.id));setPurging(null)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy('')}};
 return <><Modal open={open} onClose={onClose} title="Корзина" description="Диалоги сохраняются здесь, пока ты сам не удалишь их навсегда." className="chat-library-modal">
  {loading?<p className="library-empty"><Loader2 size={16} className="spin"/>Загружаю диалоги…</p>:<div className="library-rows">{items.map(item=><div className="trash-library-row" key={item.id}><div><strong>{item.title}</strong><small>Удалён {new Date(item.deletedAt||0).toLocaleDateString('ru-RU')} · {item.messages.length} сообщ.</small></div><IconButton label={`Восстановить ${item.title}`} disabled={!!busy} onClick={()=>void act(item)}>{busy===item.id?<Loader2 size={16} className="spin"/>:<RotateCcw size={16}/>}</IconButton><IconButton label={`Удалить навсегда ${item.title}`} disabled={!!busy} onClick={()=>setPurging(item)}><Trash2 size={16}/></IconButton></div>)}</div>}
  {!loading&&!items.length&&!error&&<p className="library-empty">Корзина пуста</p>}{error&&<p role="alert" className="library-error">{error}</p>}
 </Modal><Modal open={!!purging} onClose={()=>setPurging(null)} title="Удалить навсегда?" description={`«${purging?.title||''}» больше нельзя будет восстановить.`}><div className="confirm-actions"><Button variant="ghost" onClick={()=>setPurging(null)}>Отмена</Button><Button variant="destructive" disabled={!!busy} onClick={()=>purging&&void act(purging,true)}>Удалить навсегда</Button></div></Modal></>;
}
