import {HintButton} from './Hint';
import {accountKey} from '../accountStorage';
import {AnimatePresence,motion} from 'motion/react';
import {useReducedMotion} from '../useReducedMotion';
import {ListPresence} from './ListPresence';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import type {PageRequest} from '../usePreparedPage';
import {Plus,Shapes,Image,Loader2,MoreHorizontal,PanelLeft,Pencil,Pin,PinOff,Search,SlidersHorizontal,Sparkles,Trash2,X} from '../icons';
import {MessageSquare} from '../icons';
import {Reveal} from './Reveal';
import {softTransition} from '../motion';
import {StateTransition} from './StateTransition';
import {Avatar,IconButton} from './primitives';
import {SidebarBrand} from './SidebarBrand';
import {FolderDialog,MoveChatDialog,TrashDialog} from './ChatLibrary';
import {Folder,ChevronDown} from '../icons';
import {matchParts,type SearchResult} from '../chatSearch';
import {ChatTitleButton} from './ChatTitleButton';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuSeparator} from './ui/dropdown-menu';
import {groupChats} from '../chatGroups';
import * as chat from '../store';
import type {Chat,State,ChatFolder} from '../types';
import './sidebarMotion.css';
import './SidebarVisual.css';
import './SidebarRail.css';

function ChatActions({item,quick,deleting,generating,tapToOpen=false,onQuickDelete,onRename,onDelete,onMove}:{item:Chat;quick:boolean;deleting:boolean;generating:boolean;tapToOpen?:boolean;onQuickDelete:()=>void;onRename:()=>void;onDelete:()=>void;onMove:()=>void}){
 const[open,setOpen]=useState(false),[naming,setNaming]=useState(false),[pinning,setPinning]=useState(false);
 // Radix opens a menu on pointerdown. In the phone drawer the «…» column sits where a swipe-to-close
 // starts, so there the menu waits for the tap (the drawer suppresses the click after a drag).
 // Keyboard activation keeps Radix's own Enter/Space handling (its click has detail 0).
 const tapProps=tapToOpen?{onPointerDown:(event:{button:number;preventDefault():void})=>{if(event.button===0)event.preventDefault()},onClick:(event:{detail:number})=>{if(event.detail>0)setOpen(value=>!value)}}:{};
 const pin=async()=>{if(pinning)return;setPinning(true);try{await chat.metadata(item.id,{pinned:!item.pinned})}catch(error){chat.failure(error)}finally{setPinning(false)}};
 const name=async()=>{if(naming)return;setNaming(true);try{await chat.generateTitle(item.id)}catch(error){chat.failure(error)}finally{setNaming(false)}};
 useEffect(()=>{if(quick)setOpen(false)},[quick]);
 return <div className="chat-action-slot" data-quick={quick}>
  <div className="chat-action-layer chat-more-layer" inert={quick} aria-hidden={quick}>
   <DropdownMenu open={open&&!quick} onOpenChange={setOpen}><DropdownMenuTrigger asChild><HintButton className="chat-more" aria-label={`Действия: ${item.title}`} aria-busy={naming||pinning} {...tapProps}>{naming||pinning?<Loader2 size={16} className="spin"/>:<MoreHorizontal size={16}/>}</HintButton></DropdownMenuTrigger><DropdownMenuContent className="floating-panel" align="start"><DropdownMenuItem disabled={pinning} onSelect={()=>void pin()}><StateTransition stateKey={item.pinned?'unpin':'pin'} className="is-icon">{item.pinned?<PinOff/>:<Pin/>}</StateTransition>{item.pinned?'Открепить диалог':'Закрепить диалог'}</DropdownMenuItem><DropdownMenuItem onSelect={onMove}><Folder/>Переместить в папку</DropdownMenuItem><DropdownMenuItem onSelect={onRename}><Pencil/>Переименовать</DropdownMenuItem><DropdownMenuItem disabled={naming||generating||!item.messages.some(m=>m.role==='assistant')} onSelect={()=>void name()}><Sparkles/>Придумать название</DropdownMenuItem><DropdownMenuItem onSelect={onDelete} className="destructive"><Trash2/>Удалить диалог</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>
  <div className="chat-action-layer chat-delete-layer" inert={!quick} aria-hidden={!quick}>
   <HintButton className="chat-quick-delete" aria-label={`Удалить диалог: ${item.title}`} hint="Удалить диалог" disabled={deleting} onClick={event=>{event.stopPropagation();onQuickDelete()}}>{deleting?<Loader2 size={16} className="spin"/>:<Trash2 size={16}/>}</HintButton>
  </div>
 </div>;
}

/** Runtime exceptions (TypeError text, network stack messages) are not for the user: show what happened and how to recover. */
const technicalError=/is not an object|is not a function|Cannot read|undefined|TypeError|ReferenceError|Failed to fetch|NetworkError|Load failed/i;
function matchesWord(count:number){const tens=count%100,ones=count%10;return tens>=11&&tens<=14?'совпадений':ones===1?'совпадение':ones>=2&&ones<=4?'совпадения':'совпадений'}
function readableError(message?:string|null){return !message||technicalError.test(message)?'Не удалось открыть раздел. Нажмите «Повторить» — ваши данные не изменились.':message}
export function Sidebar({state,pageRequest,revealed,onClose,onSettings,onDelete,onRename,onImages,onChat,onWorkspace,workspaceActive=false,imagesActive=false,mobile=false,preview=false,scrollPosition}:{state:State;pageRequest?:PageRequest;revealed:boolean;onClose:()=>void;onSettings:(tab?:string)=>void;onDelete:(c:Chat)=>void;onRename:(c:Chat)=>void;onImages:()=>void|Promise<boolean>;onChat:()=>void|Promise<boolean>;onWorkspace:()=>void|Promise<boolean>;workspaceActive?:boolean;imagesActive?:boolean;mobile?:boolean;preview?:boolean;scrollPosition:{current:number}}){
 const reduced=useReducedMotion();
 const afterMobileClose=async(fn:()=>void|boolean|Promise<void|boolean>)=>{try{
  const result=flushSync(fn);
  if(await result===false)return;if(mobile||innerWidth<=800)onClose();
 }catch(error){chat.failure(error)}};
 const pendingTarget=state.navigation?.status==='loading'?`chat:${state.navigation.chatId}`:pageRequest?.status==='loading'?`page:${pageRequest.target}`:'';
 const [pendingVisible,setPendingVisible]=useState('');
 useEffect(()=>{setPendingVisible('');if(!pendingTarget)return;const timer=setTimeout(()=>setPendingVisible(pendingTarget),250);return()=>clearTimeout(timer)},[pendingTarget]);
 const[searchOpen,setSearchOpen]=useState(false),searchInput=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null),list=useRef<HTMLElement>(null);
 const chatSectionActive=!imagesActive&&!workspaceActive;
 const newDialogActive=chatSectionActive&&state.active==='new';
 const temporaryActive=!!state.chats.find(c=>c.id===state.active)?.temporary;
 const[query,setQuery]=useState(''),[shiftHeld,setShiftHeld]=useState(false),[deleting,setDeleting]=useState<Set<string>>(new Set());
 const chatListKey=accountKey('llamachat_chat_list_collapsed'),[chatListPreference,setChatListPreference]=useState(()=>({key:chatListKey,collapsed:window.localStorage.getItem(chatListKey)==='true'}));
 // The phone drawer's main column is the chat list itself, so it never collapses there.
 const chatListCollapsed=!mobile&&chatListPreference.key===chatListKey&&chatListPreference.collapsed;
 const[deletingFolder,setDeletingFolder]=useState('');
 const[folders,setFolders]=useState<ChatFolder[]>([]),[foldersReady,setFoldersReady]=useState(false),[folderDialog,setFolderDialog]=useState(false),[trash,setTrash]=useState(false),[moving,setMoving]=useState<Chat|null>(null),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[results,setResults]=useState<SearchResult[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
 const loadFolders=()=>{void chat.api('/api/folders').then(d=>setFolders(d.folders)).catch(chat.failure)};
 useEffect(()=>{if(!state.user)return;let alive=true;setFoldersReady(false);const load=()=>{void chat.api('/api/folders').then(d=>{if(alive)setFolders(d.folders)}).catch(chat.failure).finally(()=>{if(alive)setFoldersReady(true)})};load();window.addEventListener('chat-folders-updated',load);return()=>{alive=false;window.removeEventListener('chat-folders-updated',load)}},[state.user?.id]);
 useEffect(()=>{if(!query.trim()){setResults([]);setSearching(false);setSearchError('');return}let alive=true;setSearching(true);setSearchError('');const timer=setTimeout(()=>{void chat.api(`/api/chats/search?q=${encodeURIComponent(query.trim())}`).then(d=>{if(alive)setResults(d.results)}).catch(e=>{if(alive){setSearchError(e.message);setResults([])}}).finally(()=>{if(alive)setSearching(false)})},220);return()=>{alive=false;clearTimeout(timer)}},[query,state.chats]);
 useLayoutEffect(()=>{if(searchOpen)searchInput.current?.focus({preventScroll:true})},[searchOpen]);
 useLayoutEffect(()=>{
  if((!revealed&&!mobile)||!foldersReady||query.trim()||!list.current)return;
  const saved=scrollPosition.current;list.current.scrollTop=saved;
  // The drawer's portal completes its layout after the child mounts.
  const frame=requestAnimationFrame(()=>{if(list.current)list.current.scrollTop=saved});
  return()=>cancelAnimationFrame(frame);
 },[revealed,mobile,foldersReady,chatListCollapsed,!!query.trim()]);
 useEffect(()=>{
  if(!mobile)return;
  // The drawer stays mounted, so its saved scroll can leave the open chat out of view.
  const reveal=()=>{
   const container=list.current;if(!container||query.trim())return;
   const row=container.querySelector<HTMLElement>('.chat-row.active');if(!row)return;
   const box=container.getBoundingClientRect(),at=row.getBoundingClientRect();
   if(at.top>=box.top&&at.bottom<=box.bottom)return;
   container.scrollTop+=at.top-box.top-(box.height-at.height)/2;scrollPosition.current=container.scrollTop;
  };
  window.addEventListener('mobile-sidebar-prepare',reveal);return()=>window.removeEventListener('mobile-sidebar-prepare',reveal);
 },[mobile,query]);
 const closeSearch=()=>{setSearchOpen(false);setQuery('');chat.clearSearchTarget();searchButton.current?.focus({preventScroll:true})};
 const toggleGroup=(key:string)=>setCollapsed(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next});
 const pendingDeletes=useRef(new Set<string>());
 useEffect(()=>{setChatListPreference(current=>current.key===chatListKey?current:{key:chatListKey,collapsed:window.localStorage.getItem(chatListKey)==='true'})},[state.user?.id]);
 useEffect(()=>{if(chatListPreference.key===chatListKey)window.localStorage.setItem(chatListPreference.key,String(chatListPreference.collapsed))},[chatListPreference,chatListKey]);
 useEffect(()=>{
  // Shift quick-delete is a desktop keyboard feature; on the phone drawer it would swap the row
  // actions mid Shift+Tab and drop focus out of the focus trap.
  if(!revealed||mobile){setShiftHeld(false);return}
  const key=(event:KeyboardEvent)=>setShiftHeld(event.shiftKey),reset=()=>setShiftHeld(false),visibility=()=>{if(document.hidden)reset()};
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility)};
 },[revealed,mobile]);
 const quickDelete=async(c:Chat)=>{
  if(pendingDeletes.current.has(c.id))return;
  pendingDeletes.current.add(c.id);setDeleting(new Set(pendingDeletes.current));
  try{await chat.deleteChat(c.id)}catch(error){chat.failure(error)}finally{pendingDeletes.current.delete(c.id);setDeleting(new Set(pendingDeletes.current))}
 };
 const removeFolder=async(id:string)=>{if(deletingFolder)return;setDeletingFolder(id);try{await chat.api(`/api/folders/${encodeURIComponent(id)}`,'DELETE');setFolders(v=>v.filter(f=>f.id!==id));setCollapsed(v=>{const next=new Set(v);next.delete('folder-'+id);return next});window.dispatchEvent(new Event('chat-folders-updated'));chat.notify('Папка удалена. Диалоги сохранены')}catch(error){chat.failure(error)}finally{setDeletingFolder('')}};
 const filtered=useMemo(()=>state.chats.filter(c=>!c.temporary&&c.messages?.length),[state.chats]);
 const year=new Date().getFullYear();
 const groups=useMemo(()=>groupChats(filtered,new Date(),folders),[filtered,folders,year]);
 const sections=[
  {id:'chat',label:'Чат',Icon:MessageSquare,active:chatSectionActive&&state.active!=='new'&&!temporaryActive,open:onChat},
  {id:'images',label:'Генерация картинок',Icon:Image,active:imagesActive,open:onImages},
  {id:'workspace',label:'Актёры и пресеты',Icon:Shapes,active:workspaceActive,open:onWorkspace},
 ];
 const startChat=()=>afterMobileClose(()=>{chat.newChat();const opening=onChat();if(!mobile)window.dispatchEvent(new Event('focus-composer'));return opening});
 const toggleSearch=()=>searchOpen?closeSearch():setSearchOpen(true);
 const userName=state.user?.display_name||state.user?.username||'';
 const manage=<DropdownMenu><DropdownMenuTrigger asChild><HintButton type="button" className="sidebar-manage icon-button" aria-label="Управление диалогами"><SlidersHorizontal size={16}/></HintButton></DropdownMenuTrigger><DropdownMenuContent className="floating-panel sidebar-menu" align="end"><DropdownMenuItem onSelect={()=>setFolderDialog(true)}><Folder/>Папки</DropdownMenuItem><DropdownMenuItem onSelect={()=>setTrash(true)}><Trash2/>Корзина</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
 // Phone drawer: a narrow icon rail (new chat, sections, search, account) beside the chat list.
 const rail=<nav className="sidebar-rail" aria-label="Разделы приложения">
  <HintButton type="button" className={`sidebar-rail-button sidebar-rail-new ${newDialogActive?'is-active':''}`} aria-label="Создать диалог" aria-current={newDialogActive?'page':undefined} onClick={()=>void startChat()}><Plus size={20}/></HintButton>
  {sections.map(({id,label,Icon,active,open})=><HintButton key={id} type="button" className={`sidebar-rail-button ${active?'is-active':''}`} aria-label={label} aria-current={active?'page':undefined} aria-busy={pendingTarget===`page:${id}`} onClick={()=>void afterMobileClose(open)}>
   {active&&<motion.span className="sidebar-rail-highlight" layoutId="sidebar-rail-highlight" initial={false} transition={softTransition(reduced)} aria-hidden="true"/>}
   {pendingVisible===`page:${id}`?<Loader2 size={18} className="spin" aria-label="Открывается"/>:<Icon size={20}/>}
  </HintButton>)}
  <HintButton ref={searchButton} type="button" className={`sidebar-rail-button ${searchOpen?'is-active':''}`} aria-label="Поиск в диалогах" aria-expanded={searchOpen} aria-controls="sidebar-chat-list" onClick={toggleSearch}><Search size={20}/></HintButton>
  <span className="sidebar-rail-spacer" aria-hidden="true"/>
  <HintButton type="button" className="sidebar-rail-account" aria-label={userName?`Настройки · ${userName}`:'Настройки'} onClick={()=>void afterMobileClose(()=>onSettings('appearance'))}><span className="sidebar-account-avatar" aria-hidden="true"><Avatar src={state.user?.avatar} name={String(userName||'Я').toUpperCase()}/></span></HintButton>
 </nav>;
 return <div className={`sidebar-inner sidebar-refined${mobile?' sidebar-rail-mode':''}`} data-revealed={revealed} data-search-open={searchOpen} data-shift-delete={shiftHeld||undefined} onPointerMove={event=>{if(!mobile&&event.pointerType==='mouse')setShiftHeld(event.shiftKey)}}>
  {mobile?rail:<><div className="sidebar-brand" data-revealed={revealed}><SidebarBrand/><div className="sidebar-brand-actions"><HintButton ref={searchButton} className="sidebar-header-search icon-button" hint="Поиск в диалогах" aria-expanded={searchOpen} aria-controls="sidebar-chat-list" onClick={toggleSearch}><Search size={18}/></HintButton><IconButton label={preview?'Закрепить меню':mobile?'Закрыть меню':'Свернуть меню'} onClick={onClose}><PanelLeft size={18} data-panel-state={revealed?'open':'closed'}/></IconButton></div></div>
  <div className="new-chat-row"><button className={`new-chat-button ${newDialogActive?'is-active':''}`} aria-current={newDialogActive?'page':undefined} onClick={()=>void startChat()}><Plus size={18}/><span>Создать диалог</span></button></div>
  <nav className="sidebar-sections" aria-label="Разделы приложения">
   {sections.map(({id,label,Icon,active,open})=><button key={id} aria-busy={pendingTarget===`page:${id==='workspace'?'workspace':id==='images'?'images':'chat'}`} className={`sidebar-section-button ${active?'is-active':''}`} aria-current={active?'page':undefined} onClick={()=>afterMobileClose(open)}>
    {active&&<motion.span className="sidebar-section-highlight" layoutId="sidebar-section-highlight" initial={false} transition={softTransition(reduced)} aria-hidden="true"/>}
    <Icon size={18}/><span>{label}</span>{pendingVisible===`page:${id}`&&<Loader2 size={14} className="spin sidebar-pending" aria-label="Открывается"/>}
   </button>)}
  </nav></>}
  <div className="sidebar-main">
  {mobile&&<div className="sidebar-rail-header"><h2>Диалоги</h2>{manage}<IconButton label={preview?'Закрепить меню':'Закрыть меню'} onClick={onClose}><PanelLeft size={18} data-panel-state={revealed?'open':'closed'}/></IconButton></div>}
  {(state.navigation?.status==='error'||pageRequest?.status==='error')&&<div className="sidebar-navigation-error" role="alert"><span>{readableError(state.navigation?.error||pageRequest?.error)}</span><button type="button" onClick={()=>void afterMobileClose(async()=>{if(state.navigation?.status==='error'){if(!await chat.retryChatNavigation())return false;return onChat()}return pageRequest?.target==='images'?onImages():pageRequest?.target==='workspace'?onWorkspace():onChat()})}>Повторить</button></div>}
  {!mobile&&<div className="sidebar-history-heading">
   <button type="button" className="chat-list-toggle" aria-expanded={searchOpen||!chatListCollapsed} aria-controls="sidebar-chat-list" onClick={()=>{if(searchOpen)closeSearch();else setChatListPreference({key:chatListKey,collapsed:!chatListCollapsed})}}><span>Диалоги</span><ChevronDown size={14} className={searchOpen||!chatListCollapsed?'rotated':''}/></button>
   {manage}
  </div>}
  <Reveal show={searchOpen}><div className="sidebar-search"><Search size={16}/><input ref={searchInput} type="search" enterKeyHint="search" autoComplete="off" aria-label="Поиск в диалогах" placeholder="Поиск в диалогах" value={query} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch()}}} onChange={e=>{setQuery(e.target.value);if(!e.target.value.trim())chat.clearSearchTarget()}}/><IconButton label="Закрыть поиск" onClick={closeSearch}><X size={16}/></IconButton></div></Reveal>
  <AnimatePresence initial={false}>{(searchOpen||!chatListCollapsed)&&<motion.div key="chat-list-panel" className="chat-list-collapse" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={softTransition(reduced)}>
  <nav ref={list} onScroll={event=>{if(revealed&&foldersReady&&!chatListCollapsed&&!query.trim())scrollPosition.current=event.currentTarget.scrollTop}} id="sidebar-chat-list" className="chat-list" aria-label="Чаты">
   {query.trim()?<div className="sidebar-search-results"><div className="sidebar-search-status" role="status">{searching?<><Loader2 size={12} className="spin"/>Ищу в переписке…</>:searchError||`${results.length} ${matchesWord(results.length)}${results.length===80?' · уточни запрос':''}`}</div>{!searching&&results.map((result,index)=><button className="search-result" key={`${result.chat_id}:${result.branch_id}:${result.message_id}:${index}`} onClick={()=>{const q=query.trim();afterMobileClose(async()=>{if(!await chat.openSearchResult(result,q))return false;return onChat()})}}><strong>{result.title}</strong><small>{result.role==='title'?'Название диалога':`${result.role==='user'?'Ты':'Ответ'} · ${result.branch_name||'Основная'}`}</small><p>{matchParts(result.snippet,query).map((part,i)=>part.match?<mark key={i}>{part.text}</mark>:<span key={i}>{part.text}</span>)}</p></button>)}</div>:<AnimatePresence initial={false}>{groups.map(group=><ListPresence section key={group.key}>{group.key.startsWith('folder-')?<h2 className="folder-group-heading"><button className="folder-group-toggle" aria-expanded={!collapsed.has(group.key)} onClick={()=>setCollapsed(v=>{const next=new Set(v);next.has(group.key)?next.delete(group.key):next.add(group.key);return next})}><Folder size={12}/><span>{group.label}</span><span className="folder-count" aria-label={`Диалогов: ${group.chats.length}`}>{group.chats.length}</span><ChevronDown size={12} className={collapsed.has(group.key)?'':'rotated'}/></button><HintButton className="folder-delete" aria-label={`Удалить папку ${group.label}`} hint="Удалить папку · диалоги сохранятся" disabled={!!deletingFolder} onClick={()=>void removeFolder(group.key.slice('folder-'.length))}>{deletingFolder===group.key.slice('folder-'.length)?<Loader2 size={14} className="spin"/>:<Trash2 size={14}/>}</HintButton></h2> :group.key==='pinned'?<h2 className="pinned-group-heading"><button className="folder-group-toggle" aria-expanded={!collapsed.has(group.key)} onClick={()=>toggleGroup(group.key)}><span>Закреплённые</span><ChevronDown size={12} className={collapsed.has(group.key)?'':'rotated'}/></button></h2>:<h2 title={group.label}>{group.key===`date-${new Date().getFullYear()}-${new Date().getMonth()+1}-${new Date().getDate()}`?'Сегодня':group.key===(()=>{const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);return `date-${yesterday.getFullYear()}-${yesterday.getMonth()+1}-${yesterday.getDate()}`})()?'Вчера':group.label.split(',')[0]}</h2>}<AnimatePresence initial={false}>{!collapsed.has(group.key)&&group.chats.map(c=><ListPresence chatRow key={c.id} className={`chat-row ${state.navigation?.chatId===c.id?'is-navigation-target':''} ${!imagesActive&&!workspaceActive&&state.active===c.id?'active':''}`}>
    <ChatTitleButton title={c.title} active={!imagesActive&&!workspaceActive&&state.active===c.id} onSelect={()=>afterMobileClose(async()=>{if(!await chat.selectChat(c.id))return false;return onChat()})}>{c.pinned?<Pin size={12} className="chat-pin-marker" aria-label="Закреплён"/>:<span className="chat-dot" aria-hidden="true"/>}</ChatTitleButton>{pendingVisible===`chat:${c.id}`&&<Loader2 size={14} className="spin sidebar-pending" aria-label="Открывается"/>}
    <ChatActions item={c} quick={shiftHeld||deleting.has(c.id)} deleting={deleting.has(c.id)} generating={!!state.lives[c.id]} tapToOpen={mobile} onQuickDelete={()=>void quickDelete(c)} onRename={()=>onRename(c)} onDelete={()=>onDelete(c)} onMove={()=>setMoving(c)}/>
   </ListPresence>)}</AnimatePresence></ListPresence>)}</AnimatePresence>}
   {!query.trim()&&!filtered.length&&<p className="sidebar-empty">{query?'Ничего не найдено':'Здесь появятся ваши диалоги'}</p>}
  </nav>
  </motion.div>}</AnimatePresence>
  </div>
  <FolderDialog open={folderDialog} onClose={()=>setFolderDialog(false)} folders={folders} onChange={loadFolders}/><MoveChatDialog item={moving} onClose={()=>setMoving(null)} folders={folders}/><TrashDialog open={trash} onClose={()=>setTrash(false)}/>
  {!mobile&&<div className="sidebar-footer">
   <button type="button" className="sidebar-account" aria-label="Настройки" onClick={()=>afterMobileClose(()=>onSettings('appearance'))}><span className="sidebar-account-avatar" aria-hidden="true"><Avatar src={state.user?.avatar} name={String(userName||'Я').toUpperCase()}/></span><span className="sidebar-account-name">{userName||'Профиль'}</span><ChevronDown size={14}/></button>
  </div>}
 </div>;
}
