import {useEffect,useState} from 'react';
import {Archive,Check,FileText,Loader2,Pin,Plus,Shrink,Trash2} from '../icons';
import {Button,Disclosure,IconButton,Modal} from './primitives';
import {changeContext,compactContext,refreshContext,useChatContext,type ChatNote} from '../chatContext';
import * as chat from '../store';
import './ChatContextPanel.css';
import {DropdownMenuItem} from './ui/dropdown-menu';

export function PinMessage({messageId,disabled=false,menu=false}:{messageId:string;disabled?:boolean;menu?:boolean}){
 const {id,branch,data,locked}=useChatContext(),[busy,setBusy]=useState(false),pinned=!!data?.pins.some(p=>p.id===messageId);
 const toggle=async()=>{setBusy(true);try{await changeContext(id,branch,pinned?'unpin':'pin',{id:messageId});chat.notify(pinned?'Закрепление снято':'Сообщение закреплено в контексте')}catch(error){chat.failure(error);void refreshContext(id,branch).catch(()=>{})}finally{setBusy(false)}};
 if(menu)return <DropdownMenuItem disabled={!id||!data||disabled||locked||busy} onSelect={event=>{event.preventDefault();void toggle()}}>{busy?<Loader2 size={14} className="spin"/>:<Pin size={14} data-pinned={pinned}/>}<span>{pinned?'Снять закрепление в контексте':'Закрепить в контексте'}</span></DropdownMenuItem>;
 return <IconButton label={pinned?'Снять закрепление в контексте':'Закрепить в контексте'} className={pinned?'context-pin is-pinned':'context-pin'} aria-pressed={pinned} aria-busy={busy} disabled={!id||!data||disabled||locked||busy} onClick={()=>void toggle()}><span className="pin-state-glyph" data-busy={busy}><Pin size={14} data-pinned={pinned}/>{busy&&<Loader2 size={14} className="spin"/>}</span></IconButton>;
}

function ArchivedSource({chatId,branch,messageId,offset}:{chatId:string;branch:string;messageId:string;offset:number}){
 const [source,setSource]=useState<{text:string;offset:number;next_offset:number|null}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const read=async(start:number)=>{setBusy(true);setError('');try{setSource(await chat.api(`/api/chats/${encodeURIComponent(chatId)}/context/sources/${encodeURIComponent(messageId)}?expected_branch_id=${encodeURIComponent(branch)}&offset=${start}`))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 return <div className="context-archive-source"><button className="context-text-button" disabled={busy} onClick={()=>source?setSource(null):void read(offset)}>{busy?'Загружаю…':source?'Скрыть оригинал':`Оригинал · ${messageId}${offset?` · с ${offset}`:''}`}</button>{error&&<p className="inline-error" role="alert">{error}</p>}{source&&<><pre className="context-original">{source.text}</pre>{source.next_offset!==null&&<button className="context-text-button" disabled={busy} onClick={()=>void read(source.next_offset!)}>Следующий фрагмент</button>}</>}</div>;
}

export function ChatContextPanel({open,onClose}:{open:boolean;onClose:()=>void}){
 const {id,branch,data,locked}=useChatContext(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<ChatNote|'new'|'summary'|null>(null),[text,setText]=useState('');
 useEffect(()=>{setEditing(null);setError('')},[id,branch]);
 const act=async(operation:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await operation()}catch(e){setError(e instanceof Error?e.message:String(e));void refreshContext(id,branch).catch(()=>{})}finally{setBusy(false)}};
 const mutate=(action:string,values:Record<string,unknown>={})=>changeContext(id,branch,action,values);
 const pending=data?.notes.filter(n=>n.status==='pending')||[],notes=data?.notes.filter(n=>n.status==='active')||[];
 const save=()=>act(async()=>{await mutate(editing==='new'?'add_note':editing==='summary'?'edit_summary':'edit_note',{...(typeof editing==='object'&&editing?{id:editing.id}:{}),text});setEditing(null)});
 return <Modal open={open} onClose={onClose} title="Контекст этого чата" description="Заметки, закрепления и выжимка старой переписки." className="chat-context-modal">
  <div className="context-panel-body">
  {!id?<p className="settings-intro">Сначала начните диалог. Его контекст будет храниться отдельно от других чатов.</p>:!data?<div className="context-panel-loading"><Loader2 className="spin" size={18}/>Загружаю контекст…</div>:<>
   {error&&<p className="inline-error" role="alert">{error}</p>}
   <label className="switch-row"><span><strong>Сжимать старую переписку</strong><small>Сжатие запускается только при заполнении 85% контекста модели. Свежие сообщения, заметки и закрепления сохраняются целиком.</small></span><input type="checkbox" role="switch" checked={data.auto_compact} disabled={busy||locked} onChange={e=>void act(()=>mutate('auto_compact',{value:e.target.checked}))}/></label>
   <label className="switch-row"><span><strong>Предлагать заметки</strong><small>Модель предлагает важные решения. Они учитываются только после подтверждения.</small></span><input type="checkbox" role="switch" checked={data.suggest_notes} disabled={busy||locked} onChange={e=>void act(()=>mutate('suggest_notes',{value:e.target.checked}))}/></label>
   {editing&&<form className="context-note-editor" onSubmit={e=>{e.preventDefault();void save()}}><label className="settings-field"><span>{editing==='summary'?'Выжимка':editing==='new'?'Новая заметка':'Изменить заметку'}</span><textarea aria-label={editing==='summary'?'Текст выжимки':'Текст заметки'} rows={editing==='summary'?9:4} maxLength={editing==='summary'?12000:1500} required value={text} onChange={e=>setText(e.target.value)}/></label><div className="confirm-actions"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setEditing(null)}>Отмена</Button><Button disabled={busy||locked||!text.trim()}>Сохранить</Button></div></form>}
   {!!pending.length&&<section className="context-note-section"><h3>Предложения модели <small>{pending.length}</small></h3>{pending.map(note=><article className="context-note-card pending" key={note.id}><p>{note.text}</p>{note.source_quote&&<small>Основание: «{note.source_quote}»</small>}{note.replace_id&&<small>Заменит заметку: {notes.find(n=>n.id===note.replace_id)?.text||'прежнее решение'}</small>}<div className="context-note-actions"><Button variant="outline" disabled={busy||locked} onClick={()=>void act(()=>mutate('approve_note',{id:note.id}))}><Check size={14}/>Принять</Button><button disabled={busy||locked} onClick={()=>{setEditing(note);setText(note.text)}}>Изменить</button><button disabled={busy||locked} onClick={()=>void act(()=>mutate('delete_note',{id:note.id}))}>Отклонить</button></div></article>)}</section>}
   <section className="context-note-section"><header><h3><FileText size={16}/>Заметки <small>{notes.length}</small></h3><Button variant="ghost" disabled={busy||locked} onClick={()=>{setEditing('new');setText('')}}><Plus size={14}/>Добавить</Button></header>{notes.length?notes.map(note=><article className="context-note-card" key={note.id}><p>{note.text}</p><div className="context-note-actions"><button disabled={busy||locked} onClick={()=>{setEditing(note);setText(note.text)}}>Изменить</button><IconButton label="Удалить заметку" disabled={busy||locked} onClick={()=>void act(()=>mutate('delete_note',{id:note.id}))}><Trash2 size={14}/></IconButton></div></article>):<p className="context-empty-note">Требования и решения, которые важно помнить в этом разговоре. Можно написать модели: «Запомни для этого чата…».</p>}</section>
   <section className="context-note-section"><h3><Pin size={16}/>Закреплённые сообщения <small>{data.pins.length}</small></h3>{data.pins.length?data.pins.map(pin=><article className="context-note-card" key={pin.id}><small>{pin.role==='user'?'Твоё сообщение':'Ответ модели'} · передаётся целиком</small><Disclosure title={pin.text.slice(0,100)||'Сообщение'}><pre className="context-original">{pin.text}</pre></Disclosure><button className="context-text-button" disabled={busy||locked} onClick={()=>void act(()=>mutate('unpin',{id:pin.id}))}>Снять закрепление</button></article>):<p className="context-empty-note">Нажми на значок булавки под своим сообщением или ответом модели.</p>}</section>
   <section className="context-note-section">
    <header><h3><Archive size={16}/>Старая переписка</h3><span className="context-count">{data.covered_count} из {data.message_count} сообщений сжато</span></header>
    {data.compression?<>
     {data.compression.blocks?<>
      <p className="context-empty-note">Блоков: {data.compression.blocks.length}. В запросе: {data.included_blocks??data.compression.blocks.length}. Нужные оригиналы подбираются по текущему вопросу.</p>
      {data.compression.annotation&&<div className="context-note-card"><small>Твоё уточнение</small><p>{data.compression.annotation}</p></div>}
      {data.compression.blocks.map((block,index)=><div className="context-note-card" key={`${id}:${branch}:${block.id}`}><Disclosure title={`Блок ${index+1} · ${new Set(block.sources.map(s=>s.id)).size} сообщ.`}><div className="context-summary">{block.text}</div>{block.anchors.length>0&&<div className="context-archive-quotes"><small>Точные цитаты пользователя · могут быть уточнены позднее</small>{block.anchors.map((anchor,i)=><blockquote key={`${anchor.message_id}:${i}`}>{anchor.quote}</blockquote>)}</div>}{block.sources.map(source=><ArchivedSource key={`${source.id}:${source.offset}`} chatId={id} branch={branch} messageId={source.id} offset={source.offset}/>)}</Disclosure></div>)}
     </>:<Disclosure title="Прочитать выжимку"><div className="context-summary">{data.compression.text}</div></Disclosure>}
     <div className="context-note-actions"><button disabled={busy||locked} onClick={()=>{setEditing('summary');setText(data.compression?.format===2?data.compression.annotation||'':data.compression!.text)}}>{data.compression.format===2?'Уточнить выжимки':'Изменить выжимку'}</button><button disabled={busy||locked} onClick={()=>void act(()=>mutate('clear_summary'))}>Вернуть полный контекст</button></div>
    </>:<p className="context-empty-note">Пока передаётся вся переписка. При сжатии свежие сообщения и закрепления сохраняются целиком.</p>}
    <Button variant="outline" className="context-compact-button" disabled={busy||locked||data.message_count<4} onClick={()=>void act(async()=>{await compactContext(id,branch);chat.notify('Старая переписка сжата. Оригиналы сохранены')})}>{busy?<Loader2 className="spin" size={16}/>:<Shrink size={16}/>}Сжать контекст сейчас</Button>
    <p className="context-code-note">Каждый блок создан из оригинальных сообщений. Заметки и закрепления передаются целиком. Модель может читать точный код и старые договорённости через инструмент истории.</p>
   </section>
  </>}
  </div>
 </Modal>;
}

export function ChatNotePrompt(){
 const {data}=useChatContext(),count=data?.notes.filter(n=>n.status==='pending').length||0;
 return count?<button className="chat-note-prompt" onClick={()=>window.dispatchEvent(new Event('open-chat-context'))}><FileText size={14}/>{count===1?'Модель предложила заметку':`Предложения заметок: ${count}`}<span>Посмотреть</span></button>:null;
}
