import {isNativeIOS} from './native/platform';
import {useNativeNavigation} from './native/navigation';
import {triggerHaptic} from './haptics';
import {usePreparedPage} from './usePreparedPage';
import {createReadingPositions,captureReadingPosition,resolveReadingAnchor,restoreReadingPosition,type ReadingPosition} from './readingPositions';
import {diagnostic} from './diagnostics';
import {messageNeighbours} from './messageNeighbours';
import {SignIn} from './components/SignIn';
import {motionEase,softTransition,motionDuration} from './motion';
import {StateTransition} from './components/StateTransition';
import {accountKey} from './accountStorage';
import {readAloud} from './readAloud';
import {boundedScrollTop,resumeChatFollowing} from './chatScrollFollow';
import {useReadingHeader} from './useReadingHeader';
import {observeConversationRendering} from './conversationRendering';
import './conversationRendering.css';
import {SearchHighlightContext} from './chatSearch';
import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {HistoryScrollAnchor,useConversationHistory} from './useConversationHistory';
import {AnimatePresence,MotionConfig,motion} from 'motion/react';
import {useReducedMotion} from './useReducedMotion';
import {Popover} from 'radix-ui';
import {Ghost,Plus,ArrowUp,Check,ChevronDown,Loader2,LogOut,Menu,MoreHorizontal,PanelLeft,Search,Settings2,SlidersHorizontal,Square,Trash2,X,Download,Pencil,MessageSquare,WifiOff} from './icons';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuSeparator} from './components/ui/dropdown-menu';
import {TooltipProvider} from './components/ui/tooltip';
import {Avatar,Button,IconButton,Modal} from './components/primitives';
import {StreamingMessageView as MessageView,preparedMarkdown} from './components/Messages';
import {SelectionActions} from './components/SelectionActions';
import {ChatNotePrompt} from './components/ChatContextPanel';
import {ContextIndicator} from './components/ContextIndicator';
import {ChatComposer as Composer} from './components/ChatComposer';
const ImageStudio=lazy(()=>import('./components/ImageStudio').then(module=>({default:module.ImageStudio})));
// Keep the established CSS cascade while loading studio logic only on demand.
import './components/StudioHistory.css';
import './components/ArtAnimator.css';
import './components/ArtUpscaler.css';
import './components/MobileImageStudio.css';
import './components/GenerationStudio.css';
import './components/StudioPolish.css';
import {PageSurface} from './components/PageSurface';
import {LazySectionBoundary} from './components/LazySectionBoundary';
import './chatHeader.css';
import './sectionLoading.css';
import './temporaryChat.css';
import {TemporaryChatSurface,TemporaryBadge,ModeHeaderControl,ModeWelcome} from './components/TemporaryChatMotion';
import './composerLayout.css';
import './mobileChatPolish.css';
import {BranchSwitcher} from './components/BranchSwitcher';
import {assistantMessageKey,conversationMessageKeys} from './messageKeys';
import {presetPresentation} from './workspacePreset';
const Workspace=lazy(()=>import('./components/Workspace'));
import {MobileSidebar,setMobileSidebarOpen as setMobileMenu} from './components/MobileSidebar';
import {Sidebar} from './components/Sidebar';
import {DesktopSidebar} from './components/DesktopSidebar';
import {ConversationMap} from './components/ConversationMap';
import {ScrollToBottom} from './components/ScrollToBottom';
import {StartupScreen} from './components/StartupScreen';
import {animateChatSendScroll} from './chatSendScroll';
import * as chat from './store';
import {modelName,displayedMessages,reasoningKind} from './domain';
import {readingFontFamily} from './fonts';
import {useMobileViewport} from './mobileViewport';
import {welcomeTitle,personalWelcome} from './chatWelcome';
import {WelcomeHeading} from './components/ChatWelcome';
import {useRegenerationScroll} from './useRegenerationScroll';
import type {Attachment,Chat,Message,State} from './types';
import SettingsPanel from './components/Settings';
export function useMobile(){const[small,setSmall]=useState(isNativeIOS()||matchMedia('(max-width: 800px)').matches);useEffect(()=>{const media=matchMedia('(max-width: 800px)'),change=()=>setSmall(isNativeIOS()||media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[]);return small}
function usePickerFocus(){
 const pointer=useRef(false);
 return {onPointerDown:()=>{pointer.current=true},onKeyDown:()=>{pointer.current=false},onCloseAutoFocus:(event:Event)=>{if(pointer.current)event.preventDefault()}};
}

function Application(){
 const capturePageReading=useRef(()=>{});
 const {page,pending:pageRequest,request:requestPage,ready:pageReady,cancel:cancelPage}=usePreparedPage();
 const setPage=useCallback((target:'chat'|'images'|'workspace')=>{capturePageReading.current();chat.cancelChatNavigation();return requestPage(target)},[requestPage]);
 const finishPage=useCallback((id:number,error?:string)=>{if(!error)capturePageReading.current();pageReady(id,error)},[pageReady]);
 const preparingPage=pageRequest?.status==='loading'?pageRequest.target:undefined;
 const state=chat.useChatLayout(),mobile=useMobile(),reduced=useReducedMotion();
 // A keyboard shortcut is repeated and expected: it switches the panel without travel.
 const instantSidebarAt=useRef(0);const sidebarArrived=useRef(false);const instantWelcomeAt=useRef(0);const[sidebar,setSidebar]=useState(localStorage.getItem(accountKey('llamachat_sidebar_collapsed'))!=='true'),[settings,setSettings]=useState<string|null>(null),[profile,setProfile]=useState<string|null>(null),[parameters,setParameters]=useState(false),[deleting,setDeleting]=useState<Chat|null>(null),[renaming,setRenaming]=useState<Chat|null>(null),[title,setTitle]=useState(''),[preferences,setPreferences]=useState(0),[sendScroll,setSendScroll]=useState(0);
 const downwardUntil=useRef(0),panelScrollCleanup=useRef<(()=>void)|null>(null);
 useNativeNavigation({page,chatId:state.active,settings,profile,parameters},state.ready&&!!state.user,async target=>{
  setMobileMenu(false);setSettings(target.settings);setProfile(target.profile);setParameters(target.parameters);
  if(target.chatId!==state.active)await chat.selectChat(target.chatId);
  await setPage(target.page);
 });
 const following=useRef(true),lastScrollTop=useRef(0),touchY=useRef<number|undefined>(undefined),scrollingToBottom=useRef(false),manualScrolling=useRef(false),container=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null),active=state.chats.find(c=>c.id===state.active),live=state.lives[state.active],model=chat.activeModel(),presentation=useMemo(()=>presetPresentation(state.settings,chat.overrides()),[state.settings,state.active,active?.overrides,state.draftOverrides]),name=modelName(model,presentation),messages=displayedMessages(active,live),empty=messages.length===0&&!live;
 const bottomCleanup=useRef<(()=>void)|null>(null),sendFrom=useRef<number|null>(null),sendPreparing=useRef(false),interactedAt=useRef(0);
 const messageKeys=useMemo(()=>conversationMessageKeys(messages),[messages]);
 const neighbours=useMemo(()=>messageNeighbours(messages,!!live&&!messages.some(m=>m.id===live.target_message_id)),[messages,!!live,live?.target_message_id]);
 useEffect(()=>()=>readAloud.stop(),[state.user?.id,state.active,active?.active_branch_id,page]);
 const largeConversation=useMemo(()=>messages.length>=24||messages.reduce((size,m)=>size+m.content.length+(m.reasoning?.length||0),0)>=32000,[messages]);
 const historyKey=`${state.user?.id}:${state.active}:${active?.active_branch_id||'main'}`;
 const readingPositions=useMemo(()=>createReadingPositions(()=>sessionStorage,accountKey('chat-reading-position:v1')),[state.user?.id]);
 const savedReading=readingPositions.get(state.active,active?.active_branch_id||'main');
 const searchReading:ReadingPosition|undefined=state.searchTarget?.chatId===state.active?{anchorId:state.searchTarget.messageId,index:Math.max(0,messages.findIndex(message=>message.id===state.searchTarget?.messageId)),offset:28,atBottom:false,at:0}:undefined;
 const entryReading=searchReading||savedReading;
 const readingTarget=state.searchTarget?.chatId===state.active?state.searchTarget.messageId:resolveReadingAnchor(savedReading,messages);
 const readingView=useRef<{chatId:string;branchId:string;messages:Message[];temporary:boolean;hasTail:boolean}|null>(null),readingAnchorCleanup=useRef<(()=>void)|null>(null);
 const [admittedKey,setAdmittedKey]=useState('');
 const restoredEntry=useRef<{key:string;liveId?:string;historyIds:Set<string>}>({key:'',historyIds:new Set()});
 if(restoredEntry.current.key===historyKey&&restoredEntry.current.liveId&&!live)restoredEntry.current.liveId=undefined;
 if(restoredEntry.current.key!==historyKey)restoredEntry.current={key:historyKey,liveId:sendPreparing.current?undefined:live?.target_message_id,historyIds:sendPreparing.current?new Set():new Set(messages.map((message,index)=>message.id||`msg-${index}`))};
 const navigationPending=state.navigation?.status==='loading'||!!preparingPage;
 const history=useConversationHistory(historyKey,messages,largeConversation,container,page==='chat'||preparingPage==='chat',readingTarget,()=>!scrollingToBottom.current&&touchY.current===undefined&&performance.now()-interactedAt.current>260);
 useEffect(()=>()=>preparedMarkdown.clear(),[state.user?.id]);
 useEffect(()=>{
  const column=container.current?.querySelector<HTMLElement>('.message-column');
  // A few rich replies can contain thousands of layout objects. Cache actual
  // off-screen sizes regardless of the history pagination threshold.
  if(page!=='chat'||!column)return;
  return observeConversationRendering(column);
 },[state.active,active?.active_branch_id,state.ready,page]);
 const restoredPage=useRef('');
 useLayoutEffect(()=>{
  if(!state.ready||!state.user){restoredPage.current='';return}
  const key='llm-page-'+state.user.id;
  if(restoredPage.current!==key){restoredPage.current=key;try{setPage((['images','workspace'].includes(sessionStorage.getItem(key)||'')?sessionStorage.getItem(key):'chat') as 'chat'|'images'|'workspace')}catch{setPage('chat')}return}
  try{sessionStorage.setItem(key,page)}catch{}
 },[state.ready,state.user?.id,page]);
 const welcomePreset=chat.overrides().workspacePreset;
 const welcomeNick=String(state.user?.display_name||state.user?.username||'');
 const welcomeVariant=useRef(Math.floor(Math.random()*0x100000000));
 const personalHeading=useMemo(()=>personalWelcome(welcomeNick,new Date().getHours(),welcomeVariant.current++,mobile?24:undefined),[empty,state.active,welcomeNick,mobile]);
 const welcomeHeading=welcomePreset?.greeting?.trim()?welcomeTitle(welcomePreset):personalHeading;
 const [introHero,setIntroHero]=useState<{rect:DOMRect;title:string;actor?:string;avatar?:string}|null>(null);
 const dock=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=dock.current,conversation=element?.parentElement;
  if(!element||!conversation)return;
  const app=conversation.closest<HTMLElement>('.app');
  const publish=(height:number)=>{const value=`${Math.ceil(height)}px`;if(conversation.style.getPropertyValue('--composer-clearance')!==value){conversation.style.setProperty('--composer-clearance',value);app?.style.setProperty('--composer-clearance',value)}};
  const measure=()=>publish(element.offsetHeight);
  // Apply the spacer in the same frame as the dock's new height. With a rAF
  // here the composer shrink after send landed two frames before the scroll
  // range followed, and the message list visibly stepped back.
  // Observe the welcome dock too, so the first send does not install a new
  // observer and force a synchronous layout of the newly mounted conversation.
  measure();const observer=new ResizeObserver(entries=>{const height=entries[0]?.borderBoxSize?.[0]?.blockSize;if(height===undefined)measure();else publish(height)});observer.observe(element);
  return()=>{observer.disconnect();conversation.style.removeProperty('--composer-clearance');app?.style.removeProperty('--composer-clearance')};
 // A breakpoint change also changes the dock's padding. Reconcile it in the
 // layout phase, before ResizeObserver broadcasts the newly sized column.
 },[state.ready,!!state.user,page,mobile]);
 const pauseManualScroll=()=>{readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;downwardUntil.current=0;cancelBottom();window.dispatchEvent(new Event('composer-sent'));following.current=false;manualScrolling.current=true;};
 const preservePanelScroll=()=>{
  if(mobile)return;
  panelScrollCleanup.current?.();panelScrollCleanup.current=null;
  const scroll=container.current;if(!scroll)return;
  const viewport=scroll.getBoundingClientRect(),anchor=[...scroll.querySelectorAll<HTMLElement>('.message[data-message-id]')].find(node=>{const rect=node.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom});
  pauseManualScroll();if(!anchor)return;
  const column=scroll.querySelector<HTMLElement>('.message-column'),top=anchor.getBoundingClientRect().top;
  let stopped=false,timer=0;
  const adjust=()=>{if(stopped||!anchor.isConnected)return;const drift=anchor.getBoundingClientRect().top-top;if(Math.abs(drift)>.5)scroll.scrollTop+=drift};
  const observer=new ResizeObserver(adjust);if(column)observer.observe(column);observer.observe(anchor);scroll.dataset.panelAnchoring='true';adjust();
  const stop=()=>{if(stopped)return;stopped=true;observer.disconnect();window.clearTimeout(timer);scroll.removeEventListener('wheel',stop);scroll.removeEventListener('touchstart',stop);scroll.removeEventListener('pointerdown',stop);delete scroll.dataset.panelAnchoring;if(panelScrollCleanup.current===stop)panelScrollCleanup.current=null};
  scroll.addEventListener('wheel',stop,{once:true,passive:true});scroll.addEventListener('touchstart',stop,{once:true,passive:true});scroll.addEventListener('pointerdown',stop,{once:true,passive:true});
  panelScrollCleanup.current=stop;
  timer=window.setTimeout(stop,reduced?80:460);
 };
 useEffect(()=>()=>panelScrollCleanup.current?.(),[]);
 useEffect(()=>{const onVariantStart=(event:Event)=>{const detail=(event as CustomEvent<{chatId?:string}>).detail;if(page==='chat'&&detail?.chatId===state.active)pauseManualScroll()};window.addEventListener('chat-variant-switch-start',onVariantStart);return()=>window.removeEventListener('chat-variant-switch-start',onVariantStart)},[state.active,page,mobile]);
 const messagePointerDown=(event:React.PointerEvent<HTMLDivElement>)=>{
  // Native middle-button autoscroll does not emit wheel events. It must take
  // ownership even when the press lands on a paragraph or an image.
  if(event.button===1||event.target===event.currentTarget)pauseManualScroll();
 };
 const messageScrolled=()=>{
  const el=container.current;if(!el)return;
  const top=boundedScrollTop(el.scrollTop,el.scrollHeight,el.clientHeight),previous=lastScrollTop.current,distance=Math.max(0,el.scrollHeight-top-el.clientHeight);
  if(Math.abs(top-previous)>.5&&!scrollingToBottom.current){readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;interactedAt.current=performance.now()}
  if(scrollingToBottom.current||document.documentElement.dataset.viewportResizing==='true'||el.dataset.variantAnchoring==='true'||el.dataset.panelAnchoring==='true'){lastScrollTop.current=top;return}
  // Also covers the scrollbar, Page Up and browser-native autoscroll. Do not
  // reattach at the bottom while its first upward steps are still within 2px.
  if(!el.dataset.statsAnimating&&top<previous-.01){following.current=false;manualScrolling.current=true}
  else if(resumeChatFollowing(following.current,mobile,distance,top,previous,downwardUntil.current,performance.now())){manualScrolling.current=false;following.current=true}
  lastScrollTop.current=top;
 };
 useEffect(()=>{const sent=()=>{prepareSendScroll();setSendScroll(v=>v+1)};window.addEventListener('suggestion-sent',sent);return()=>window.removeEventListener('suggestion-sent',sent)},[]);

 const cancelBottom=()=>{bottomCleanup.current?.();bottomCleanup.current=null;scrollingToBottom.current=false};
 const prepareSendScroll=()=>{
  readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;
  // A send needs the tail, not synchronous Markdown rendering of all older rows.
  // Idle history preparation resumes after the send scroll releases ownership.
  if(history.end<messages.length)history.reveal(messages.length-1);
  window.dispatchEvent(new Event('composer-sent'));cancelBottom();
  const el=container.current;
  sendFrom.current=el?.scrollTop??0;sendPreparing.current=true;
  manualScrolling.current=false;following.current=true;scrollingToBottom.current=true;
 };
 const goToBottom=(duration=280,from?:number|null,interruptMomentum=false)=>{
  readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;if(interruptMomentum)history.revealAll();
  window.dispatchEvent(new Event('composer-sent'));cancelBottom();manualScrolling.current=false;following.current=true;
  const el=container.current;if(!el)return;
   scrollingToBottom.current=true;
   if(interruptMomentum&&mobile)diagnostic('client.lifecycle',{source:'scroll_bottom',state:'accepted'});
   // duration 0 (a send) pins the list to the live bottom on every layout change
   // until the keyboard settles; the only visible motion is the rows' entrance.
   bottomCleanup.current=animateChatSendScroll(el,{from,duration,reduced:reduced||duration<=0,interruptMomentum:interruptMomentum&&mobile,
    viewportChanging:()=>document.documentElement.dataset.viewportResizing==='true',
    onProgress:top=>{lastScrollTop.current=top},
    onComplete:()=>{bottomCleanup.current=null;scrollingToBottom.current=false;manualScrolling.current=false;lastScrollTop.current=el.scrollTop;if(interruptMomentum&&mobile){const gap=Math.max(0,el.scrollHeight-el.clientHeight-el.scrollTop);diagnostic('client.lifecycle',{source:'scroll_bottom',state:gap<2?'complete':'incomplete',count:gap})}},
   });
 };
 useEffect(()=>()=>{bottomCleanup.current?.()},[]);
 const font=localStorage.getItem(accountKey('saxara_chat_font'))||'serif';
 useEffect(()=>{void chat.init();const preference=()=>setPreferences(v=>v+1);window.addEventListener('preferences-changed',preference);return()=>{window.removeEventListener('preferences-changed',preference)}},[]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(document.querySelector('.settings-ux'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();instantWelcomeAt.current=performance.now();chat.newChat();window.dispatchEvent(new Event('focus-composer'))}if((e.ctrlKey||e.metaKey)&&e.key===','){e.preventDefault();setSettings('appearance')}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();instantSidebarAt.current=performance.now();if(mobile)setMobileMenu(v=>!v,false);else setSidebar(v=>!v)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[mobile]);
 useEffect(()=>{localStorage.setItem(accountKey('llamachat_sidebar_collapsed'),String(!sidebar))},[sidebar]);
 useMobileViewport(mobile);
 useEffect(()=>{const pause=(event:Event)=>{if(!mobile)return;
  // An explicit send owns scrolling through its keyboard resize. Focus and
  // manual gestures still stop it; ordinary keyboard opening preserves reading.
  if(event.type==='mobile-viewport-changing'&&(sendPreparing.current||bottomCleanup.current))return;
  downwardUntil.current=0;cancelBottom();following.current=false;manualScrolling.current=true;
 };window.addEventListener('composer-focus',pause);window.addEventListener('mobile-viewport-changing',pause);return()=>{window.removeEventListener('composer-focus',pause);window.removeEventListener('mobile-viewport-changing',pause);}},[mobile]);
 const saveReading=useCallback(()=>{
  if(page!=='chat')return;const view=readingView.current,el=container.current;if(!view||!el||view.chatId==='new')return;
  const bookmark=captureReadingPosition(el,view.messages,view.hasTail&&el.scrollHeight-el.clientHeight-el.scrollTop<48);
  if(bookmark)readingPositions.save(view.chatId,view.branchId,bookmark,view.temporary);
 },[readingPositions,page]);
 capturePageReading.current=saveReading;
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const changed=()=>{clearTimeout(timer);timer=setTimeout(saveReading,150)},hide=()=>{if(document.hidden)saveReading()};
  const stop=chat.subscribeBeforeChatViewChange(()=>{clearTimeout(timer);saveReading();cancelPage()});
  container.current?.addEventListener('scroll',changed,{passive:true});window.addEventListener('pagehide',saveReading);document.addEventListener('visibilitychange',hide);
  const el=container.current;return()=>{clearTimeout(timer);stop();el?.removeEventListener('scroll',changed);window.removeEventListener('pagehide',saveReading);document.removeEventListener('visibilitychange',hide);readingAnchorCleanup.current?.()};
 },[saveReading,readingPositions,state.ready,!!state.user]);
 useEffect(()=>()=>readingPositions.clearMemory(),[readingPositions]);
 useLayoutEffect(()=>{
  readingView.current={chatId:state.active,branchId:active?.active_branch_id||'main',messages,temporary:!!active?.temporary,hasTail:history.end>=messages.length};
 },[historyKey,messages,history.end]);
 useLayoutEffect(()=>{
  if((page!=='chat'&&preparingPage!=='chat')||regenerationLayout.isActive())return;
  const el=container.current;if(!el)return;
  readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;
  if(!sendPreparing.current){
   cancelBottom();const bottom=restoreReadingPosition(el,entryReading,messages);
   following.current=bottom;manualScrolling.current=!bottom;lastScrollTop.current=el.scrollTop;
   if(!bottom&&entryReading){
    const anchor={...entryReading,anchorId:readingTarget||entryReading.anchorId,offset:readingTarget===entryReading.anchorId?entryReading.offset:0};
    let stopped=false;const observer=new ResizeObserver(()=>{if(stopped||scrollingToBottom.current||el.dataset.variantAnchoring||el.dataset.panelAnchoring)return;restoreReadingPosition(el,anchor,messages);lastScrollTop.current=el.scrollTop});
    const column=el.querySelector('.message-column');if(column)observer.observe(column);observer.observe(el);
    readingAnchorCleanup.current=()=>{stopped=true;observer.disconnect()};
   }
  }
  setAdmittedKey(historyKey);
  if(preparingPage==='chat'&&pageRequest)finishPage(pageRequest.id);
 },[historyKey,page,preparingPage,state.searchTarget?.nonce]);
 useLayoutEffect(()=>{if(!sendScroll)return;sendPreparing.current=false;const from=sendFrom.current;sendFrom.current=null;goToBottom(0,from)},[sendScroll]);
 // The column ResizeObserver follows the text actually painted by the reveal
 // loop. Measuring here for every incoming token forces an extra full layout.
 useLayoutEffect(()=>{if(document.documentElement.dataset.viewportResizing!=='true'&&!live?.target_message_id&&following.current&&!manualScrolling.current&&!scrollingToBottom.current&&state.settings.autoScroll!==false){const el=container.current;if(el&&!el.dataset.statsAnimating){el.scrollTop=el.scrollHeight;lastScrollTop.current=el.scrollTop}}},[messages.length,state.settings.autoScroll,live?.target_message_id]);
 useEffect(()=>{const el=container.current,column=el?.querySelector('.message-column');if(page!=='chat'||!el||!column)return;const observer=new ResizeObserver(()=>{if(el.dataset.statsAnimating||el.dataset.variantAnchoring==='true'||el.dataset.panelAnchoring==='true'||document.documentElement.dataset.viewportResizing==='true')return;if(document.documentElement.dataset.viewportResizing!=='true'&&!live?.target_message_id&&following.current&&!manualScrolling.current&&!scrollingToBottom.current&&state.settings.autoScroll!==false){el.scrollTop=el.scrollHeight;lastScrollTop.current=el.scrollTop}});observer.observe(column);observer.observe(el);return()=>observer.disconnect()},[state.active,active?.active_branch_id,empty,state.settings.autoScroll,live?.target_message_id,page]);
 const sidebarScroll=useRef(0);
 const [studioSidebar,setStudioSidebar]=useState(false),visibleSidebar=page==='images'?studioSidebar:sidebar;
 const closeSidebar=useCallback(()=>mobile?setMobileMenu(false):page==='images'?setStudioSidebar(false):setSidebar(false),[mobile,page]),openSettings=useCallback((tab='appearance')=>{setSettings(tab);setMobileMenu(false)},[]),rename=useCallback((c:Chat)=>{setTitle(c.title);setRenaming(c)},[]),openWorkspace=useCallback(()=>setPage('workspace'),[setPage]),openImages=useCallback(()=>setPage('images'),[setPage]),openChat=useCallback(()=>requestPage('chat'),[requestPage]),sidebarRevealed=mobile||(sidebarArrived.current||=visibleSidebar);
 const sidebarContent=useMemo(()=><Sidebar state={state} pageRequest={pageRequest} mobile={mobile} scrollPosition={sidebarScroll} revealed={sidebarRevealed} onClose={closeSidebar} onSettings={openSettings} onDelete={setDeleting} onRename={rename} workspaceActive={page==='workspace'} onWorkspace={openWorkspace} imagesActive={page==='images'} onImages={openImages} onChat={openChat}/>,[state,pageRequest,mobile,sidebarRevealed,closeSidebar,openSettings,rename,page,openWorkspace,openImages,openChat]);
 const queues=state.queues.filter(q=>q.chatId===state.active);
 const regenerationLayout=useRegenerationScroll(container,state.active,active?.active_branch_id||'main',live?.target_message_id,reduced,()=>{cancelBottom();window.dispatchEvent(new Event('composer-sent'));following.current=false;manualScrolling.current=true},page==='chat');
 useLayoutEffect(()=>{const area=container.current;area?.querySelectorAll('[data-search-target]').forEach(node=>node.removeAttribute('data-search-target'));const target=state.searchTarget;if(!target||target.chatId!==state.active||page!=='chat')return;const node=Array.from(area?.querySelectorAll<HTMLElement>('[data-message-id]')||[]).find(node=>node.dataset.messageId===target.messageId);if(node)node.dataset.searchTarget='true'},[state.searchTarget,state.active,active?.active_branch_id,page]);
 const liveMessage:Message|undefined=live?{id:live.target_message_id||'live',role:'assistant',content:live.text||'',reasoning:live.reasoning,model:live.model||model,timestamp:Date.now(),thinkingDuration:undefined,metrics:undefined,tool_events:live.tool_events,generated_images:live.generated_images,web_images:live.web_images,sources:live.sources}:undefined;
 const readingHeader=useReadingHeader(container,mobile&&state.ready&&!!state.user&&page==='chat'&&!empty,historyKey,!!settings||!!profile||parameters,()=>scrollingToBottom.current||container.current?.dataset.variantAnchoring==='true'||container.current?.dataset.panelAnchoring==='true');
 const headerMenu=<DropdownMenu><DropdownMenuTrigger asChild><button className={mobile?"mobile-chat-title":"icon-button header-more"} aria-label={mobile?`Действия с диалогом: ${active?.title||"Новый диалог"}`:"Действия с диалогом"}>{mobile?<><span>{active?.title||"Новый диалог"}</span><ChevronDown size={16}/></>:<MoreHorizontal size={18}/>}</button></DropdownMenuTrigger><DropdownMenuContent className="floating-panel mobile-chat-title-menu" align={mobile?"start":"end"}>{mobile&&<><DropdownMenuItem onSelect={()=>{preservePanelScroll();setParameters(!parameters)}}><SlidersHorizontal/>Параметры чата</DropdownMenuItem><DropdownMenuSeparator/></>}<DropdownMenuItem disabled={!active} onSelect={()=>chat.exportChat()}><Download/>Скачать Markdown</DropdownMenuItem><DropdownMenuItem onSelect={()=>openSettings()}><Settings2/>Настройки</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem disabled={!active||!!live} onSelect={()=>active?.temporary?void chat.endTemporaryChat():active&&setDeleting(active)} className="destructive"><Trash2/>Удалить диалог</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
 return <MotionConfig reducedMotion={reduced?'always':'never'} transition={{type:'tween',duration:reduced?0:motionDuration.detail,ease:motionEase}}><TooltipProvider delayDuration={420}><SearchHighlightContext.Provider value={state.searchTarget?.query||''}><div className={`app font-${font}`} style={{'--reading-size':`${state.settings.fontSize||16}px`,'--reading-font':readingFontFamily(font)} as React.CSSProperties} data-preferences={preferences}>
  <AnimatePresence>{!state.ready&&<StartupScreen key="startup"/>}</AnimatePresence>{state.ready&&<motion.div className="app-content" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.48,ease:[.23, 1, .32, 1]}}>{!state.user?<SignIn/>:<>
  <a className="skip-to-content" href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus({preventScroll:true})}}>К основному содержимому</a>
  {!mobile&&<DesktopSidebar open={visibleSidebar} reduced={reduced||performance.now()-instantSidebarAt.current<200}>{sidebarContent}</DesktopSidebar>}
  {!mobile&&!visibleSidebar&&<div className="collapsed-settings"><IconButton label="Настройки" onClick={()=>openSettings()}><Settings2 size={18}/></IconButton></div>}
  {mobile&&<MobileSidebar>{sidebarContent}</MobileSidebar>}
  {pageRequest?.status==='error'&&<div className="page-navigation-error" role="alert"><span>{pageRequest.error}</span><button type="button" onClick={()=>void setPage(pageRequest.target)}>Повторить</button><IconButton label="Закрыть сообщение" onClick={cancelPage}><X size={16}/></IconButton></div>}
  <div className="page-stage" id="main-content" tabIndex={-1}>
  <PageSurface active={page==='images'} prepare={preparingPage==='images'} name="images"><LazySectionBoundary resetKey={pageRequest?.id} onError={error=>{if(pageRequest)finishPage(pageRequest.id,error.message)}} title="студию" onBack={()=>setPage('chat')}><Suspense fallback={<div className="section-loading-shell" aria-busy="true"><span/><span/><span/></div>}><ImageStudio active={page==='images'||preparingPage==='images'} onReady={error=>{if(preparingPage==='images'&&pageRequest)finishPage(pageRequest.id,error)}} onConnection={()=>openSettings('connection')} key={String(state.user?.id||'local')} showMenuButton={mobile||!visibleSidebar} userId={String(state.user?.id||'local')} onMenu={()=>mobile?setMobileMenu(true):setStudioSidebar(v=>!v)} onChat={()=>setPage('chat')}/></Suspense></LazySectionBoundary></PageSurface>
  <PageSurface active={page==='workspace'} prepare={preparingPage==='workspace'} name="workspace" keepMounted><section className="workspace-shell"><header className="chat-header"><div>{(mobile||!sidebar)&&<IconButton data-sidebar-preview-trigger label="Открыть меню" onClick={()=>mobile?setMobileMenu(true):setSidebar(true)}><PanelLeft size={18} data-panel-state="closed"/></IconButton>}</div></header><LazySectionBoundary resetKey={pageRequest?.id} onError={error=>{if(pageRequest)finishPage(pageRequest.id,error.message)}} title="рабочее пространство" onBack={()=>setPage('chat')}><Suspense fallback={<div className="section-loading-shell" aria-busy="true"><span/><span/><span/></div>}><Workspace key={String(state.user?.id||'local')} active={page==='workspace'||preparingPage==='workspace'} onReady={error=>{if(preparingPage==='workspace'&&pageRequest)finishPage(pageRequest.id,error)}} onStart={preset=>{chat.startPreset(preset);setPage('chat');setParameters(false);setMobileMenu(false)}}/></Suspense></LazySectionBoundary></section></PageSurface>
  <PageSurface active={page==='chat'} prepare={preparingPage==='chat'} name="chat" keepMounted><TemporaryChatSurface temporary={!!active?.temporary} empty={empty} reduced={reduced} className={`main-panel ${empty?'empty-chat':''}`}><header ref={readingHeader.header} className="chat-header"><div className="chat-navigation-group">{(mobile||!sidebar)&&<div className="header-navigation"><IconButton data-sidebar-preview-trigger label="Открыть меню" onClick={()=>mobile?setMobileMenu(true):setSidebar(true)}><PanelLeft size={18} data-panel-state="closed"/></IconButton></div>}{mobile&&!(empty&&!active?.temporary)&&headerMenu}<AnimatePresence initial={false}>{!mobile&&active?.temporary&&<TemporaryBadge key="temporary"/>}</AnimatePresence><BranchSwitcher chat={active} locked={!!live||state.queues.some(q=>q.chatId===state.active&&!q.failed)}/></div><div className="header-actions"><IconButton label="Создать диалог" className="mobile-new" onClick={()=>{chat.newChat();if(!mobile)window.dispatchEvent(new Event('focus-composer'))}}><Plus size={18}/></IconButton><AnimatePresence initial={false}>{!active?.temporary&&<ModeHeaderControl key="parameters"><IconButton label="Параметры чата" className={parameters?'selected-control':''} onClick={()=>{preservePanelScroll();setParameters(!parameters)}}><SlidersHorizontal size={18}/></IconButton></ModeHeaderControl>}</AnimatePresence>{!mobile&&headerMenu}<IconButton label={active?.temporary?'Завершить временный чат':'Временный чат'} className="header-temporary" aria-pressed={!!active?.temporary} aria-busy={!!state.temporaryStarting} disabled={state.temporaryStarting} onClick={()=>void(active?.temporary?chat.endTemporaryChat():chat.startTemporaryChat()).catch(chat.failure)}><StateTransition stateKey={state.temporaryStarting?'busy':'ready'} className="is-icon">{state.temporaryStarting?<Loader2 size={18} className="spin"/>:<Ghost size={18}/>}</StateTransition></IconButton></div></header>
  <div className="conversation-layout"><div className="conversation"><motion.div layoutScroll layoutDependency={messages} ref={container} className="message-scroll" onPointerDown={messagePointerDown} onWheel={event=>{interactedAt.current=performance.now();readingAnchorCleanup.current?.();readingAnchorCleanup.current=null;cancelBottom();if(event.deltaY>0&&!((event.target as Element).closest('.reasoning-text,pre,.table-scroll')))downwardUntil.current=performance.now()+1400;if(event.deltaY<0&&!((event.target as Element).closest('.reasoning-text,pre,.table-scroll'))){following.current=false;manualScrolling.current=true;}}} onTouchStart={event=>{interactedAt.current=performance.now();downwardUntil.current=0;cancelBottom();touchY.current=event.touches[0]?.clientY;if(!((event.target as Element).closest('.reasoning-text,pre,.table-scroll')))pauseManualScroll()}} onTouchMove={event=>{const y=event.touches[0]?.clientY;if(y!=null&&touchY.current!=null&&!((event.target as Element).closest('.reasoning-text,pre,.table-scroll'))){const movement=y-touchY.current;if(movement< -1)downwardUntil.current=performance.now()+1400;else if(movement>1){downwardUntil.current=0;following.current=false;manualScrolling.current=true;}}touchY.current=y}} onTouchEnd={()=>{touchY.current=undefined;interactedAt.current=performance.now()}} onTouchCancel={()=>{touchY.current=undefined;interactedAt.current=performance.now();downwardUntil.current=0}} onScroll={messageScrolled}>
   {!empty&&<HistoryScrollAnchor conversationKey={historyKey} start={history.start} end={history.end} suspended={sendPreparing.current||scrollingToBottom.current} scroll={container} onAdjust={top=>{lastScrollTop.current=top;readingHeader.syncScroll(top)}}><div className="message-column" style={{visibility:admittedKey===historyKey?undefined:'hidden'}} key={`${state.active}:${active?.active_branch_id||'main'}`}>
    {/* Keep the pending reply and history in one flat keyed list. Moving a
        keyed row from outside map() into its nested array remounts it on
        stream_end, collapsing the reader's scroll range and selection. */}
    {[
     ...messages.map((m,i)=>m.role==='system'||i<history.start||i>=history.end?null:<MessageView key={messageKeys[i]} nextUser={neighbours[i].nextUser} last={neighbours[i].last} message={liveMessage&&live?.target_message_id===m.id?{...m,...liveMessage}:m.id?m:{...m,id:`msg-${i}`}} showSuggestions={messages.at(-1)?.id===m.id} settings={presentation} onProfile={setProfile} presentation={restoredEntry.current.liveId===m.id?'restored':restoredEntry.current.historyIds.has(m.id||`msg-${i}`)?'history':undefined} live={live?.target_message_id===m.id?live:undefined} locked={navigationPending||!!live&&messages.at(-1)?.id===m.id}/>),
     liveMessage&&!messages.some(m=>m.id===live?.target_message_id)&&<MessageView key={assistantMessageKey([...messages,liveMessage],messages.length)} last message={liveMessage} settings={presentation} onProfile={setProfile} presentation={restoredEntry.current.liveId===liveMessage.id?'restored':undefined} live={live} locked/>
    ]}
    <div ref={end} className="scroll-anchor"/></div></HistoryScrollAnchor>}
  </motion.div>{!empty&&!mobile&&<ConversationMap container={container} messages={[...messages.filter(m=>m.role!=='system'),...(liveMessage&&!messages.some(m=>m.id===live?.target_message_id)?[liveMessage]:[])]} settings={presentation} onNavigate={id=>{pauseManualScroll();const index=messages.findIndex((message,i)=>(message.id||`msg-${i}`)===id);if(index>=0)flushSync(()=>history.reveal(index));const element=Array.from(container.current?.querySelectorAll<HTMLElement>('.message[data-message-id]')||[]).find(node=>node.dataset.messageId===id);if(!element)return;cancelBottom();window.dispatchEvent(new Event('composer-sent'));following.current=false;manualScrolling.current=true;const el=container.current;if(el){const top=element.getBoundingClientRect().top-el.getBoundingClientRect().top+el.scrollTop-20;el.scrollTo({top:Math.max(0,top),behavior:reduced?'instant':'smooth'})}}}/>}<div ref={dock} className="composer-dock">{!empty&&page==='chat'&&!active?.temporary&&<ChatNotePrompt/>}
   <AnimatePresence initial={false} mode="popLayout">{empty&&<motion.div key="welcome" className="welcome-heading" initial={{opacity:0,y:reduced?0:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:active?.temporary&&!reduced?-6:0,pointerEvents:'none',transition:{duration:active?.temporary&&!reduced?.14:0}}} transition={{type:'tween',duration:reduced||performance.now()-instantWelcomeAt.current<300?0:motionDuration.surface,ease:motionEase}}><ModeWelcome temporary={!!active?.temporary}><WelcomeHeading title={welcomeHeading} actor={welcomePreset?.name} avatar={welcomePreset?.cover}/></ModeWelcome></motion.div>}</AnimatePresence>
   {!empty&&<ScrollToBottom key={`${state.active}:${active?.active_branch_id||'main'}`} container={container} enabled={page==='chat'} forceVisible={history.end<messages.length} onClick={()=>goToBottom(240,undefined,true)}/>}
   <AnimatePresence initial={false}>{queues.length>0&&<motion.div className="queued-messages" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{type:'tween',duration:reduced?0:.2,ease:[.23, 1, .32, 1]}}><AnimatePresence initial={false}>{queues.map(q=><motion.div key={q.id} initial={false} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0,paddingTop:0,paddingBottom:0,borderWidth:0}} transition={{type:'tween',duration:reduced?0:.2,ease:[.23, 1, .32, 1]}}><span>{q.failed?'Не отправлено':'В очереди'} · {q.content||'Изображение'}</span>{q.failed&&<button onClick={()=>void chat.retryQueue(q.id)}>Повторить</button>}<IconButton label="Убрать из очереди" onClick={()=>chat.cancelQueue(q.id)}><X size={14}/></IconButton></motion.div>)}</AnimatePresence></motion.div>}</AnimatePresence>
   <AnimatePresence initial={false}>{state.error&&<motion.div className="error-banner" role="alert" transition={softTransition(reduced)} initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}><span>{state.error}</span><IconButton label="Закрыть ошибку" onClick={chat.clearError}><X size={14}/></IconButton></motion.div>}</AnimatePresence>
    <Composer mobile={mobile} state={state} navigationPending={navigationPending} welcome={empty&&!mobile} fresh={empty} visible={page==='chat'} onMode={setPage} onProfile={setProfile} onBeforeSend={()=>{prepareSendScroll();if(empty&&!(mobile&&document.documentElement.dataset.keyboard==='true')){const hero=dock.current?.querySelector<HTMLElement>('.welcome-heading');if(hero&&!reduced&&!active?.temporary)setIntroHero({rect:hero.getBoundingClientRect(),title:welcomeHeading,actor:welcomePreset?.name,avatar:welcomePreset?.cover})}}} onSend={()=>{window.dispatchEvent(new Event('composer-sent'));setSendScroll(v=>v+1)}}/>
  </div></div><Suspense fallback={null}><AnimatePresence>{parameters&&!active?.temporary&&<SettingsPanel key="parameters" kind="parameters" onClose={()=>{preservePanelScroll();setParameters(false);requestAnimationFrame(()=>document.querySelector<HTMLElement>(mobile?'.mobile-chat-title':'.header-actions button[aria-label="Параметры чата"]')?.focus({preventScroll:true}))}} onProfile={id=>{if(mobile)setParameters(false);setProfile(id)}}/>}</AnimatePresence></Suspense></div></TemporaryChatSurface></PageSurface>
  </div>
  <Suspense fallback={<div className="lazy-indicator"><Loader2 className="spin"/></div>}>{settings&&<SettingsPanel kind="general" tab={settings} onClose={()=>setSettings(null)} onProfile={id=>{setSettings(null);setProfile(id)}}/>} {profile&&<SettingsPanel key={profile} kind="profile" model={profile} onClose={()=>{setProfile(null);requestAnimationFrame(()=>document.querySelector<HTMLElement>('.model-picker-updated[data-state="open"]')?.focus({preventScroll:true}))}} onProfile={setProfile}/>}</Suspense>
  {page==='chat'&&!empty&&!active?.temporary&&<SelectionActions key={`${state.user.id}:${state.active}:${active?.active_branch_id||'main'}`} container={container} locked={!!live}/>}
  <Modal open={!!renaming} onClose={()=>setRenaming(null)} title="Название диалога"><form className="compact-form" onSubmit={e=>{e.preventDefault();if(renaming)void chat.metadata(renaming.id,{title}).then(()=>setRenaming(null)).catch(chat.failure)}}><input aria-label="Название диалога" value={title} onChange={e=>setTitle(e.target.value)} autoFocus/><Button type="submit">Сохранить</Button></form></Modal>
  <Modal open={!!deleting} onClose={()=>setDeleting(null)} title="Переместить в корзину?" description="Диалог можно будет восстановить вместе с сообщениями и настройками."><div className="confirm-actions"><Button variant="ghost" onClick={()=>setDeleting(null)}>Отмена</Button><Button variant="destructive" onClick={()=>{if(deleting)void chat.deleteChat(deleting.id).then(()=>setDeleting(null)).catch(chat.failure)}}>Удалить</Button></div></Modal>
  </>}</motion.div>}
  {introHero&&createPortal(<motion.div aria-hidden="true" inert className="welcome-heading intro-hero" style={{position:'fixed',left:introHero.rect.left,top:introHero.rect.top,width:introHero.rect.width,height:introHero.rect.height,margin:0,pointerEvents:'none',zIndex:40}} initial={{opacity:1,y:0}} animate={{opacity:0,y:-10}} transition={{duration:.18,ease:[.23, 1, .32, 1]}} onAnimationComplete={()=>setIntroHero(null)}><WelcomeHeading title={introHero.title} actor={introHero.actor} avatar={introHero.avatar}/></motion.div>,document.body)}
  <AnimatePresence>{state.toast&&<motion.div className="toast" role="status" transition={softTransition(reduced,motionDuration.surface)} key={state.toast} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:6}}><Check size={14}/>{state.toast}{state.undoChat&&<button onClick={()=>state.undoChat&&void chat.restoreChat(state.undoChat.id).catch(chat.failure)}>Отменить</button>}</motion.div>}</AnimatePresence>
 </div></SearchHighlightContext.Provider></TooltipProvider></MotionConfig>
}

export default function App(){const userId=chat.useChatSelection(state=>state.user?.id);return <Application key={userId??"signed-out"}/>;}
