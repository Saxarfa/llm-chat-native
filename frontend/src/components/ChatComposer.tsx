import {memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AnimatePresence,motion} from 'motion/react';
import {ArrowUp,CornerDownLeft,Square,X} from '../icons';
import {createComposerBuffer} from '../composerBuffer';
import {randomId} from '../randomId';
import {createDraftWriter} from '../composerDraft';
import {composerDraftFiles} from '../composerDraftFiles';
import {observeComposerInputTiming} from '../composerInputTiming';
import {diagnostic} from '../diagnostics';
import {appendDictation} from '../dictation';
import {composePastedMessage,isLargePaste} from '../pastedText';
import {insertWelcomeStarter} from '../chatWelcome';
import {triggerHaptic} from '../haptics';
import {softTransition} from '../motion';
import {useReducedMotion} from '../useReducedMotion';
import * as chat from '../store';
import type {Attachment,State} from '../types';
import {ChatComposerEditor,type EditorCallbacks} from './ChatComposerEditor';
import {AttachmentPresence} from './AttachmentPresence';
import {AttachmentDocument} from './AttachmentDocument';
import {chatAttachmentAcceptFor,isFileAttachment,prepareChatAttachment} from '../chatAttachments';
import {ComposerTools,ComposerReasoning} from './ComposerTools';
import {ContextIndicator} from './ContextIndicator';
import {ModelPicker} from './ModelPicker';
import {Dictation} from './Dictation';
import {IconButton} from './primitives';
import {PastedTextCard} from './PastedTextCard';
import {Hint} from './Hint';

const Tools=memo(ComposerTools),Reasoning=memo(ComposerReasoning),Context=memo(ContextIndicator),Models=memo(ModelPicker),Voice=memo(Dictation);
type Buffer=ReturnType<typeof createComposerBuffer>;
/** Отправочное движение: подъём строк 220 мс + задержка ответа 50 мс (Messages.tsx) с запасом. */
type Props={state:State;welcome:boolean;fresh?:boolean;visible:boolean;mobile:boolean;navigationPending?:boolean;onMode:(mode:'chat'|'images')=>void;onProfile:(id:string)=>void;onSend:()=>void;onBeforeSend:()=>void};

function SendControl({reply,buffer,extras,locked,live,onSend}:{reply:boolean;buffer:Buffer;extras:boolean;locked:boolean;live:boolean;onSend:()=>void}){
 const present=useSyncExternalStore(buffer.subscribe,buffer.hasText),available=!locked&&(present||extras);
 // Keep the native disabled property and the focus chain unchanged while
 // typing. The action guard reads the latest text, even before a render frame.
 const label=live?'Добавить в очередь':'Отправить сообщение';
 return <Hint text={`${label} (Enter)`}><button type="button" className="chat-composer-send" aria-label={label} aria-disabled={!available} data-reply={reply}
  onMouseDown={event=>event.preventDefault()}
  onClick={()=>{if(!locked&&(buffer.read().trim()||extras))onSend()}}>{reply?<CornerDownLeft size={18}/>:<ArrowUp size={20}/>}</button></Hint>;
}

export function ChatComposer({state,welcome,fresh=welcome,visible,mobile,navigationPending=false,onProfile,onSend,onBeforeSend}:Props){
 const buffer=useMemo(()=>createComposerBuffer(),[]),field=useRef<HTMLTextAreaElement>(null),surface=useRef<HTMLDivElement>(null),files=useRef<HTMLInputElement>(null);
 const [attachments,setAttachments]=useState<Attachment[]>([]),[pastes,setPastes]=useState<string[]>([]),[uploading,setUploading]=useState(false),[dictating,setDictating]=useState(false);
 const active=state.chats.find(item=>item.id===state.active),scope=state.active==='new'?state.draftOverrides.workspacePreset?.id:active?.active_branch_id;
 const draftKey=`llm-account-${state.user?.id}:llm-draft-${state.active}${scope&&scope!=='main'?'-'+scope:''}`,live=state.lives[state.active],reduced=useReducedMotion();
 const temporary=state.active.startsWith('temp_'),writer=useMemo(()=>createDraftWriter(draftKey,()=>sessionStorage,180,composerDraftFiles),[draftKey]);
 const draft=useRef({attachments,pastes}),pasteIds=useRef<string[]>([]);draft.current={attachments,pastes};
 // Cards need keys that survive removal of a neighbour, or the wrong card plays its exit.
 const setPasteList=(next:string[],ids:string[]=next.map(()=>randomId()))=>{pasteIds.current=ids;setPastes(next)};
 const epoch=useRef(0),pendingImages=useRef(0),restoringFiles=useRef(false),imageKeys=useRef(new WeakMap<Attachment,string>());
 const imageKey=(image:Attachment)=>{let key=imageKeys.current.get(image);if(!key){key=randomId();imageKeys.current.set(image,key)}return key};
 const save=(text=buffer.read(),images=draft.current.attachments,texts=draft.current.pastes)=>{if(!temporary)writer.update({text,attachments:images,pastedTexts:texts})};
 const currentSave=useRef(save);currentSave.current=save;
 const replace=useCallback((text:string)=>{buffer.write(text);if(field.current&&field.current.value!==text)field.current.value=text},[buffer]);
 useEffect(()=>()=>buffer.dispose(),[buffer]);
 useLayoutEffect(()=>{
  const flush=()=>writer.flush(),hide=()=>{if(document.hidden)flush()};
  window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hide);
  return()=>{flush();window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hide)};
 },[writer]);
 useLayoutEffect(()=>{
  epoch.current++;pendingImages.current=0;restoringFiles.current=false;setUploading(false);
  let text='',images:Attachment[]=[],texts:string[]=[],fileKey:string|undefined;
  if(!temporary)try{
   const saved=JSON.parse(sessionStorage.getItem(draftKey)||'{}');text=typeof saved.text==='string'?saved.text:'';
   images=Array.isArray(saved.attachments)?saved.attachments:[];texts=Array.isArray(saved.pastedTexts)?saved.pastedTexts.filter((item:unknown)=>typeof item==='string'):[];
   fileKey=typeof saved.fileKey==='string'?saved.fileKey:undefined;
  }catch{}
  draft.current={attachments:images,pastes:texts};replace(text);setAttachments(images);setPasteList(texts);
  if(fileKey){
   const owner=epoch.current;restoringFiles.current=true;setUploading(true);writer.restoring(fileKey);
   void composerDraftFiles.get(fileKey).then(items=>{
    if(owner!==epoch.current||draft.current.attachments!==images)return;
    if(!items)throw new Error('Не удалось восстановить вложения черновика. Прикрепите файлы снова.');
    writer.restored(fileKey,items);draft.current={...draft.current,attachments:items};setAttachments(items);
    writer.update({text:buffer.read(),attachments:items,pastedTexts:draft.current.pastes});
   }).catch(error=>{if(owner===epoch.current){writer.restored(fileKey,[]);chat.failure(error)}}).finally(()=>{if(owner===epoch.current){restoringFiles.current=false;if(pendingImages.current===0)setUploading(false)}});
  }
  return()=>{epoch.current++};
 },[draftKey,replace]);
 useEffect(()=>{if(mobile&&field.current)return observeComposerInputTiming(field.current,data=>diagnostic('client.lifecycle',data))},[mobile]);
 useEffect(()=>{
  const focus=()=>field.current?.focus({preventScroll:true});window.addEventListener('focus-composer',focus);
  return()=>window.removeEventListener('focus-composer',focus);
 },[]);
 useEffect(()=>{
  const choose=(event:Event)=>{
   const text=(event as CustomEvent).detail?.text;if(!welcome||typeof text!=='string')return;
   const next=insertWelcomeStarter(buffer.read(),text);replace(next);currentSave.current(next);field.current?.focus({preventScroll:true});field.current?.setSelectionRange(next.length,next.length);
  };
  window.addEventListener('welcome-starter',choose);return()=>window.removeEventListener('welcome-starter',choose);
 },[welcome,buffer,replace]);
 const attach=useCallback(()=>files.current?.click(),[]);
 const voiceActive=useCallback((value:boolean)=>{setDictating(value);if(value)field.current?.blur()},[]);
 const voiceText=useCallback((text:string)=>{const next=appendDictation(buffer.read(),text);replace(next);currentSave.current(next)},[buffer,replace]);
 const addImages=async(selected:File[])=>{
  if(restoringFiles.current||navigationPending)return;
  const batch=selected;if(!batch.length)return;
  const owner=epoch.current;pendingImages.current++;setUploading(true);
  try{
   const results=await Promise.allSettled(batch.map(file=>prepareChatAttachment(file,chat.activeModel())));if(owner!==epoch.current)return;
   const prepared=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]),failed=results.find(result=>result.status==='rejected');
   if(failed?.status==='rejected')chat.failure(failed.reason);
   const images=[...draft.current.attachments,...prepared];draft.current={...draft.current,attachments:images};setAttachments(images);save(buffer.read(),images);
  }catch(error){if(owner===epoch.current)chat.failure(error)}
  finally{if(owner===epoch.current&&--pendingImages.current===0)setUploading(false)}
 };
 const submit=async()=>{
  const text=buffer.read(),images=draft.current.attachments,texts=draft.current.pastes,owner=epoch.current;
  if(navigationPending||dictating||uploading||live?.stopping||(!text.trim()&&!images.length&&!texts.length))return;
  triggerHaptic('send');
  try{
   onBeforeSend();const pending=chat.send(composePastedMessage(text,texts),images);
   draft.current={attachments:[],pastes:[]};replace('');setAttachments([]);setPasteList([]);writer.clear();onSend();
   // Телефон: после отправки клавиатура убирается (просьба пользователя 08.11.2026); на ПК фокус остаётся.
   // Сразу, в том же касании — как на референсе IMG_1134 (11.11.2026): капсула уезжает вниз вместе
   // с клавиатурой одним движением. Прежняя задержка 360 мс обходила рывок, причиной которого была
   // кривая дока (он обгонял клавиатуру и прятался за ней); теперь док едет по пружине клавиатуры
   // (mobileViewport.ts, KEYBOARD_MOTION_MS).
   if(mobile){const target=field.current;if(target&&target.ownerDocument.activeElement===target)target.blur()}
   await pending;
  }catch(error){if(owner!==epoch.current){if(!temporary){writer.update({text,attachments:images,pastedTexts:texts});void writer.flush()}return}draft.current={attachments:images,pastes:texts};replace(text);setAttachments(images);setPasteList(texts);save(text,images,texts);chat.failure(error)}
 };
 const composing=useRef(false),callbacks=useRef<EditorCallbacks>(null!);
 callbacks.current={
  drop:event=>{event.preventDefault();if(!dictating)void addImages([...event.dataTransfer?.files||[]])},
  input:text=>{if(navigationPending){replace(buffer.read());return}buffer.write(text);save(text)},blur:()=>writer.flush(),composition:value=>{composing.current=value},
  key:event=>{
   if(navigationPending){if(event.key==='Enter'||event.key==='Escape')event.preventDefault();return}
   if(event.key==='Enter'&&!event.shiftKey&&!composing.current&&!event.isComposing&&event.keyCode!==229){event.preventDefault();void submit()}
   if(event.key==='Escape'&&live)void chat.stop();
  },
  paste:event=>{
   if(navigationPending){event.preventDefault();return}const data=event.clipboardData;if(!data)return;
   if(data.files.length){event.preventDefault();void addImages([...data.files]);return}
   const text=data.getData('text/plain');if(isLargePaste(text)){event.preventDefault();const next=[...draft.current.pastes,text];draft.current={...draft.current,pastes:next};setPasteList(next,[...pasteIds.current,randomId()]);save(buffer.read(),draft.current.attachments,next)}
  },
 };
 const leading=<div className="chat-composer-leading" inert={navigationPending}><input ref={files} type="file" hidden multiple accept={chatAttachmentAcceptFor(chat.activeModel())} onChange={event=>{void addImages([...event.target.files||[]]);event.target.value=''}}/><Tools state={state} side={welcome?'bottom':'top'} onAttach={attach} uploading={uploading}/></div>;
 const voice=<span className="chat-composer-voice" inert={navigationPending}><Voice key={draftKey} overlayRoot={surface} disabled={uploading||!!live?.stopping||!visible} onActiveChange={voiceActive} onText={voiceText}/></span>;
 return <div className="chat-composer" data-welcome={welcome}>
  <div className="chat-composer-surface" ref={surface} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(!dictating)void addImages([...event.dataTransfer.files])}}>
   <div className="chat-composer-content" inert={dictating} data-recording={dictating}>
    <AnimatePresence initial={false}>{(attachments.length>0||pastes.length>0)&&<motion.div className="attachment-tray chat-composer-attachments" inert={navigationPending} initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={softTransition(reduced)}>
     <AnimatePresence initial={false}>{attachments.map((image,index)=><AttachmentPresence key={imageKey(image)}><div className="attachment">{isFileAttachment(image)?<AttachmentDocument attachment={image}/>:<img src={image.dataUrl} alt={image.name}/>}<IconButton label={`Убрать ${image.name}`} onClick={()=>{const images=draft.current.attachments.filter((_,i)=>i!==index);draft.current={...draft.current,attachments:images};setAttachments(images);save(buffer.read(),images)}}><X size={12}/></IconButton></div></AttachmentPresence>)}</AnimatePresence>
     <AnimatePresence initial={false}>{pastes.map((text,index)=><AttachmentPresence key={pasteIds.current[index]}><PastedTextCard text={text} index={index} onChange={value=>{const next=draft.current.pastes.map((item,i)=>i===index?value:item);draft.current={...draft.current,pastes:next};setPasteList(next,pasteIds.current);save(buffer.read(),draft.current.attachments,next)}} onRemove={()=>{const next=draft.current.pastes.filter((_,i)=>i!==index);draft.current={...draft.current,pastes:next};setPasteList(next,pasteIds.current.filter((_,i)=>i!==index));save(buffer.read(),draft.current.attachments,next)}}/></AttachmentPresence>)}</AnimatePresence>
    </motion.div>}</AnimatePresence>
    <div className="chat-composer-main">
     {welcome&&leading}
     <ChatComposerEditor readOnly={navigationPending} welcome={welcome} field={field} callbacks={callbacks} hint={fresh?'Чем могу помочь сегодня?':'Ответить'} disabled={dictating}/>
     <div className="chat-composer-actions" inert={navigationPending}>{welcome&&voice}{live&&<IconButton className="chat-composer-stop" label="Остановить генерацию" onClick={()=>{triggerHaptic('stop');void chat.stop()}}><Square size={14}/></IconButton>}<SendControl reply={!welcome} buffer={buffer} extras={attachments.length>0||pastes.length>0} locked={navigationPending||uploading||dictating||!!live?.stopping} live={!!live} onSend={()=>void submit()}/></div>
    </div>
   </div>
  </div>
  <div className="chat-composer-meta" data-reply={!welcome}><div className="chat-composer-meta-start">{!welcome&&<div className="chat-composer-meta-tools" inert={dictating}>{leading}{voice}</div>}{!active?.temporary&&<Context state={state} model={chat.activeModel()} linear/>}</div><div className="chat-composer-models" inert={navigationPending}><Models state={state} onProfile={onProfile} side={welcome&&!mobile?'bottom':'top'}/><Reasoning state={state} side={welcome?'bottom':'top'}/></div></div>
  <div className="composer-status">{live?.stopping?'Сохраняем частичный ответ…':null}</div>
 </div>;
}
