import {HintButton} from './Hint';
import {useCallback,useEffect,useRef,useState} from 'react';
import {pollVisible} from '../visiblePolling';
import {BookOpen,FileText,Loader2,Plus,RefreshCw,Search,Trash2,Upload,X} from '../icons';
import {Button,Disclosure,IconButton,Modal} from './primitives';
import {Reveal} from './Reveal';
import * as chat from '../store';
import {knowledgeSelection,knowledgeStatus,knowledgeCount,type KnowledgeSelection,type KnowledgeLibrary,type KnowledgeDocument,type KnowledgeChunk} from '../knowledge';
import type {Source} from '../types';
import './KnowledgeSettings.css';

type KnowledgePickerProps={value?:KnowledgeSelection;onChange:(value:KnowledgeSelection)=>void};
export function KnowledgePicker(props:KnowledgePickerProps){
 const owner=chat.useChatSelection(state=>state.user?.id);
 return <AccountKnowledgePicker key={String(owner??'guest')} {...props}/>;
}
function AccountKnowledgePicker({value,onChange}:KnowledgePickerProps){
 const selected=knowledgeSelection(value),[libraries,setLibraries]=useState<KnowledgeLibrary[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[manage,setManage]=useState(false);
 useEffect(()=>{let alive=true,sequence=0;const update=()=>{const ticket=++sequence;void chat.api('/api/knowledge/libraries').then(d=>{if(alive&&ticket===sequence){setLibraries(d.libraries);setReady(true);setError('')}}).catch(e=>{if(alive&&ticket===sequence)setError(String(e.message))})};update();window.addEventListener('knowledge-updated',update);return()=>{alive=false;sequence++;window.removeEventListener('knowledge-updated',update)}},[]);
 const patch=(values:Partial<KnowledgeSelection>)=>onChange({...selected,...values});
 return <div className="knowledge-picker"><label className="switch-row"><span><strong>Использовать базу знаний</strong><small>Модель ищет в выбранных документах через инструменты.</small></span><input type="checkbox" role="switch" aria-label="Использовать базу знаний" checked={selected.enabled} onChange={e=>patch({enabled:e.target.checked})}/></label>
 {error&&<p role="alert" className="error-text">{error}</p>}
 {selected.enabled&&<><div className="knowledge-choices">{!ready&&!error&&<div className="knowledge-documents-placeholder" aria-busy="true"><span/><span/></div>}{libraries.map(lib=><label key={lib.id}><input type="checkbox" checked={selected.collections.includes(lib.id)} onChange={e=>patch({collections:e.target.checked?[...selected.collections,lib.id]:selected.collections.filter(id=>id!==lib.id)})}/><span><strong>{lib.name}</strong><small>{knowledgeCount(lib.documents||0,'document')}</small></span><BookOpen size={16}/></label>)}{ready&&!libraries.length&&<p className="settings-intro">Создайте базу и добавьте материалы.</p>}{ready&&selected.collections.some(id=>!libraries.some(l=>l.id===id))&&<p className="error-text">Одна из выбранных баз недоступна. <button className="text-button" onClick={()=>patch({collections:selected.collections.filter(id=>libraries.some(l=>l.id===id))})}>Убрать из выбора</button></p>}</div><label className="knowledge-check"><input type="checkbox" checked={selected.strict} onChange={e=>patch({strict:e.target.checked})}/>Отвечать только по базе</label><small className="knowledge-hint">В этом режиме поиск обязателен, веб-поиск отключён. Если подтверждения нет, модель сообщит об этом.</small>{!selected.collections.length&&<p className="settings-intro">Выберите хотя бы одну базу для поиска.</p>}</>}
 <Button variant="outline" onClick={()=>setManage(true)}><BookOpen size={16}/>Управлять базами</Button>
 <Modal open={manage} onClose={()=>setManage(false)} title="Базы знаний" className="knowledge-manager-modal"><KnowledgeSettings/></Modal></div>;
}

export function KnowledgeSourcePreview({source,onClose}:{source:Source;onClose:()=>void}){
 const [chunk,setChunk]=useState<KnowledgeChunk>(),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void chat.api('/api/knowledge/chunks/'+encodeURIComponent(source.chunk_id||'')).then(d=>{if(alive)setChunk(d.chunk)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[source.chunk_id]);
 return <Modal open onClose={onClose} title={source.title||'Источник из базы знаний'} description={[source.site_name,source.heading,source.page?'Страница '+source.page:'',source.revision?'Версия '+source.revision:''].filter(Boolean).join(' · ')} className="knowledge-source-modal">{error?<p role="alert" className="error-text">{error}</p>:chunk?<div className="knowledge-source-text">{chunk.text}</div>:<p role="status"><Loader2 className="spin" size={16}/> Загружаю источник…</p>}</Modal>;
}

export function KnowledgeSettings({active=true,onReady}:{active?:boolean;onReady?:(error?:string)=>void}={}){
 const owner=chat.useChatSelection(state=>state.user?.id);
 return <KnowledgeManager key={String(owner??'guest')} activeView={active} owner={owner} onReady={onReady}/>;
}

function KnowledgeManager({activeView,owner,onReady}:{activeView:boolean;owner:number|undefined;onReady?:(error?:string)=>void}){
 const [libraries,setLibraries]=useState<KnowledgeLibrary[]>([]),[active,setActive]=useState(''),[pendingLibrary,setPendingLibrary]=useState(''),[documents,setDocuments]=useState<KnowledgeDocument[]>([]),[ready,setReady]=useState(false),[documentsOwner,setDocumentsOwner]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [libraryDraft,setLibraryDraft]=useState<KnowledgeLibrary|null>(null),[note,setNote]=useState<{title:string;text:string;document?:KnowledgeDocument}|null>(null),[preview,setPreview]=useState<{document:KnowledgeDocument;chunks:KnowledgeChunk[];next_offset:number|null}|null>(null),[deleting,setDeleting]=useState<{type:'library'|'document';item:KnowledgeLibrary|KnowledgeDocument}|null>(null),[undo,setUndo]=useState<{path:string;label:string}|null>(null);
 const [query,setQuery]=useState(''),[results,setResults]=useState<KnowledgeChunk[]|null>(null),[source,setSource]=useState<Source|null>(null),file=useRef<HTMLInputElement>(null),sequence=useRef(0),alive=useRef(true),currentActive=useRef(active);currentActive.current=pendingLibrary||active;
 const [pendingVisible,setPendingVisible]=useState('');
 useEffect(()=>{setPendingVisible('');if(!pendingLibrary)return;const timer=setTimeout(()=>setPendingVisible(pendingLibrary),250);return()=>clearTimeout(timer)},[pendingLibrary]);
 const valid=()=>alive.current&&chat.getState().user?.id===owner;
 const notifyReady=useRef(onReady),readinessError=useRef('');notifyReady.current=onReady;
 const refresh=useCallback(async()=>{
  const id=++sequence.current;
  try{
   const data=await chat.api('/api/knowledge/libraries');
   if(!valid()||id!==sequence.current)return;
   const selected=data.libraries.some((l:KnowledgeLibrary)=>l.id===currentActive.current)?currentActive.current:data.libraries[0]?.id||'';
   // Publish the selected library and its documents together. The presented
   // library remains usable while a different document set is prepared.
   if(selected){
    const list=await chat.api('/api/knowledge/libraries/'+selected+'/documents');
    if(!valid()||id!==sequence.current)return;
    setDocuments(list.documents);setDocumentsOwner(selected);
   }else{setDocuments([]);setDocumentsOwner('')}
   currentActive.current=selected;setActive(selected);setPendingLibrary('');setLibraries(data.libraries);setReady(true);readinessError.current='';setError('');
  }catch(e){if(valid()&&id===sequence.current){setPendingLibrary('');readinessError.current=(e as Error).message;setError(readinessError.current)}}
 },[owner]);
 useEffect(()=>{
  alive.current=activeView;if(!activeView)return;
  // Do not reject a retry with an error retained from the prior activation.
  readinessError.current='';setError('');
  const stop=pollVisible(refresh,5000),update=()=>void refresh();
  window.addEventListener('knowledge-updated',update);
  return()=>{alive.current=false;sequence.current++;stop();window.removeEventListener('knowledge-updated',update)};
 },[refresh,activeView]);
 useEffect(()=>{if(!activeView)return;if(ready&&(!active||documentsOwner===active))notifyReady.current?.();else if(readinessError.current)notifyReady.current?.(readinessError.current)},[activeView,ready,active,documentsOwner,error]);
 const act=async(id:string,work:()=>Promise<void>)=>{setBusy(id);setError('');try{await work();window.dispatchEvent(new Event('knowledge-updated'));await refresh()}catch(e){setError((e as Error).message);await refresh()}finally{setBusy('')}};
 const choose=async(id:string)=>{
  if(id===pendingLibrary)return;
  if(id===active){sequence.current++;currentActive.current=active;setPendingLibrary('');return}
  currentActive.current=id;setPendingLibrary(id);setError('');
  const seq=++sequence.current;
  try{const d=await chat.api('/api/knowledge/libraries/'+id+'/documents');if(valid()&&seq===sequence.current){setActive(id);setPendingLibrary('');setDocuments(d.documents);setDocumentsOwner(id);setResults(null);setPreview(null)}}
  catch(e){if(valid()&&seq===sequence.current){currentActive.current=active;setPendingLibrary('');setError((e as Error).message)}}
 };
 const upload=async(files:File[])=>act('upload',async()=>{for(const file of files){if(file.size>20*1024*1024)throw new Error('Файл должен быть не больше 20 МБ.');const response=await fetch('/api/knowledge/libraries/'+active+'/upload?filename='+encodeURIComponent(file.name),{method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok)throw new Error(data.detail||'Не удалось загрузить файл');if(data.duplicate)chat.notify('Этот файл уже есть в базе')}});
 const show=async(doc:KnowledgeDocument)=>act('preview',async()=>setPreview(await chat.api('/api/knowledge/documents/'+doc.id)));
 const editText=async(doc:KnowledgeDocument)=>act('edit',async()=>{const data=await chat.api('/api/knowledge/documents/'+doc.id+'/text');setPreview(null);setNote({title:doc.title,text:data.text,document:doc})});
 const remove=()=>deleting&&act('delete',async()=>{const {type,item}=deleting,path='/api/knowledge/'+(type==='library'?'libraries/':'documents/')+item.id;await chat.api(path+'?version='+item.version,'DELETE');setDeleting(null);setPreview(null);setUndo({path:path+'/restore',label:type==='library'?'База удалена':'Документ удалён'})});
 const library=libraries.find(l=>l.id===active);
 return <section className="knowledge-settings"><header className="knowledge-heading"><div><h3>Базы знаний</h3><p>Материалы, на которые модель сможет опираться в ответах.</p></div><Button variant="outline" disabled={!!busy} onClick={()=>setLibraryDraft({id:'',name:'',description:'',version:0})}><Plus size={16}/>Создать</Button></header>
 <Reveal show={!!error}><div className="knowledge-error" role="alert"><span>{error}</span><HintButton aria-label="Закрыть ошибку" onClick={()=>setError('')}><X size={14}/></HintButton></div></Reveal>
 <Reveal show={!!undo}><div className="knowledge-undo"><span>{undo?.label}</span><button onClick={()=>undo&&void act('undo',async()=>{await chat.api(undo.path,'POST');setUndo(null)})}>Восстановить</button></div></Reveal>
 {!ready&&!error&&<div className="knowledge-loading-placeholder" role="status" aria-label="Загрузка баз знаний" aria-busy="true"><span/><span/><span/></div>}
 {ready&&!libraries.length&&<div className="knowledge-empty"><BookOpen size={32}/><h4>Своя библиотека для модели</h4><p>Лор, инструкции, заметки или документация.<br/>Создайте базу и добавьте первый документ.</p></div>}
 {!!libraries.length&&<><div className="knowledge-library-tabs" role="tablist" aria-label="Базы знаний">{libraries.map(l=><button role="tab" aria-selected={active===l.id} aria-busy={pendingLibrary===l.id} key={l.id} onClick={()=>void choose(l.id)}><BookOpen size={14}/>{l.name}<small>{l.documents||0}</small>{pendingVisible===l.id&&<Loader2 size={14} className="spin" aria-label="Открывается"/>}</button>)}</div>
 <div className="knowledge-library-heading"><div><h4>{library?.name}</h4>{library?.description&&<p>{library.description}</p>}</div><IconButton label="Редактировать базу" onClick={()=>library&&setLibraryDraft({...library})}><FileText size={16}/></IconButton><IconButton label="Удалить базу" onClick={()=>library&&setDeleting({type:'library',item:library})}><Trash2 size={16}/></IconButton></div>
 <div className="knowledge-upload"><div><Upload size={20}/><span><strong>Добавить материалы</strong><small>PDF с текстом, DOCX, TXT, Markdown · до 20 МБ</small></span></div><div><Button variant="outline" disabled={!!busy} onClick={()=>file.current?.click()}>{busy==='upload'?<Loader2 size={16} className="spin"/>:<Plus size={16}/>}Файлы</Button><Button variant="ghost" disabled={!!busy} onClick={()=>setNote({title:'',text:''})}>Написать заметку</Button></div><input ref={file} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.markdown" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void upload(files)}}/></div>
 <div className="knowledge-documents" aria-busy={documentsOwner!==active}>{documentsOwner!==active&&!error&&<div className="knowledge-documents-placeholder" role="status" aria-label="Загрузка документов"><span/><span/></div>}{documentsOwner===active&&documents.map(doc=><article key={doc.id}><FileText size={18}/><button className="knowledge-doc-open" onClick={()=>void show(doc)} disabled={!!busy}><strong>{doc.title}</strong><small>{knowledgeStatus(doc.status)}{doc.status==='indexing'?` · ${doc.progress}%`:doc.chunk_count?` · ${knowledgeCount(doc.chunk_count,'chunk')}`:''} · версия {doc.revision}</small>{doc.error&&<span className="error-text">{doc.error}</span>}</button>{['queued','indexing'].includes(doc.status)?<Loader2 size={16} className="spin"/>:<>{['error','interrupted'].includes(doc.status)&&<IconButton label={'Повторить обработку '+doc.title} disabled={!!busy} onClick={()=>void act('retry',async()=>{await chat.api('/api/knowledge/documents/'+doc.id+'/retry','POST')})}><RefreshCw size={16}/></IconButton>}<IconButton label={'Удалить '+doc.title} disabled={!!busy} onClick={()=>setDeleting({type:'document',item:doc})}><Trash2 size={16}/></IconButton></>}</article>)}{documentsOwner===active&&!documents.length&&<p className="knowledge-hint">В этой базе пока нет документов.</p>}</div>
 <Disclosure title={<><Search size={14}/> Проверить поиск</>}><form className="knowledge-search" onSubmit={e=>{e.preventDefault();void act('search',async()=>{const data=await chat.api('/api/knowledge/search','POST',{query,collections:[active]},120000);setResults(data.results)})}}><input aria-label="Вопрос для проверки поиска" placeholder="Что нужно найти в этой базе?" maxLength={1000} value={query} onChange={e=>setQuery(e.target.value)}/><Button aria-label="Найти фрагменты" disabled={!!busy||!query.trim()}>{busy==='search'?<Loader2 size={16} className="spin"/>:<Search size={16}/>}</Button></form>{results&&<div className="knowledge-search-results">{results.length?results.map(c=><button key={c.id} onClick={()=>setSource({kind:'knowledge',url:'',chunk_id:c.id,title:c.title,site_name:c.library,page:c.page||undefined,heading:c.heading,revision:c.revision})}><strong>{c.title}{c.heading?' · '+c.heading:''}</strong><span>{c.text}</span></button>):<p>Подходящие фрагменты не найдены.</p>}</div>}</Disclosure></>}
 <Modal open={!!libraryDraft} onClose={()=>setLibraryDraft(null)} title={libraryDraft?.id?'Настроить базу':'Новая база знаний'} className="knowledge-note-modal">{libraryDraft&&<form onSubmit={e=>{e.preventDefault();void act('library',async()=>{const data=await chat.api('/api/knowledge/libraries'+(libraryDraft.id?'/'+libraryDraft.id:''),libraryDraft.id?'PUT':'POST',{name:libraryDraft.name,description:libraryDraft.description,...(libraryDraft.id?{version:libraryDraft.version}:{})});setLibraryDraft(null);currentActive.current=data.library.id;setActive(data.library.id)})}}><label className="settings-field"><span>Название</span><input required maxLength={100} value={libraryDraft.name} onChange={e=>setLibraryDraft({...libraryDraft,name:e.target.value})} placeholder="Например, Cyberpunk 2077"/></label><label className="settings-field"><span>Описание</span><textarea maxLength={1000} rows={3} value={libraryDraft.description} onChange={e=>setLibraryDraft({...libraryDraft,description:e.target.value})}/></label><div className="modal-actions"><Button type="button" variant="ghost" onClick={()=>setLibraryDraft(null)}>Отмена</Button><Button disabled={!!busy||!libraryDraft.name.trim()}>Сохранить</Button></div></form>}</Modal>
 <Modal open={!!note} onClose={()=>setNote(null)} title={note?.document?'Изменить текст документа':'Новая заметка'} className="knowledge-note-modal">{note&&<form onSubmit={e=>{e.preventDefault();void act('note',async()=>{await chat.api(note.document?'/api/knowledge/documents/'+note.document.id:'/api/knowledge/libraries/'+active+'/notes',note.document?'PUT':'POST',{title:note.title,text:note.text,...(note.document?{version:note.document.version}:{})});setNote(null)})}}><label className="settings-field"><span>Название</span><input required maxLength={200} value={note.title} onChange={e=>setNote({...note,title:e.target.value})}/></label><label className="settings-field"><span>Текст</span><textarea required className="knowledge-note-text" maxLength={2000000} value={note.text} onChange={e=>setNote({...note,text:e.target.value})}/></label>{note.document&&<small>Сохранится новая текстовая версия. Прежние ссылки в ответах сохранят свои отрывки.</small>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={()=>setNote(null)}>Отмена</Button><Button disabled={!!busy||!note.title.trim()||note.text.trim().length<10}>Сохранить</Button></div></form>}</Modal>
 <Modal open={!!preview} onClose={()=>setPreview(null)} title={preview?.document.title||'Документ'} description={preview?`${knowledgeCount(preview.document.chunk_count,'chunk')} · версия ${preview.document.revision}`:undefined} className="knowledge-source-modal">{preview&&<><div className="knowledge-document-preview">{preview.chunks.map(c=><section key={c.id}><small>{c.heading||'Фрагмент '+(c.ordinal+1)}{c.page?' · страница '+c.page:''}</small><p>{c.text}</p></section>)}{preview.next_offset!==null&&<Button variant="outline" disabled={!!busy} onClick={()=>void act('more',async()=>{const next=await chat.api('/api/knowledge/documents/'+preview.document.id+'?offset='+preview.next_offset);setPreview({...next,chunks:[...preview.chunks,...next.chunks]})})}>Показать ещё</Button>}</div><div className="modal-actions"><Button variant="outline" disabled={!!busy||['queued','indexing'].includes(preview.document.status)} onClick={()=>void editText(preview.document)}>Изменить текст</Button><Button variant="ghost" onClick={()=>setPreview(null)}>Закрыть</Button></div></>}</Modal>
 <Modal open={!!deleting} onClose={()=>setDeleting(null)} title={deleting?.type==='library'?'Удалить базу знаний?':'Удалить документ?'} description="Материалы перестанут участвовать в поиске. После удаления можно сразу восстановить их." persistent><div className="modal-actions"><Button variant="ghost" disabled={!!busy} onClick={()=>setDeleting(null)}>Отмена</Button><Button disabled={!!busy} onClick={()=>void remove()}><Trash2 size={14}/>Удалить</Button></div></Modal>
 {source&&<KnowledgeSourcePreview source={source} onClose={()=>setSource(null)}/>}
 </section>;
}
