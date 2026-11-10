import {useEffect,useRef,useState} from 'react';
import {Dialog} from 'radix-ui';
import {ArrowUp,GitBranch,ImagePlus,Loader2,Square,X} from '../icons';
import {attachTouchScroll} from '../touchScroll';
import {Button,IconButton} from './primitives';
import {Select,SelectOption} from './Select';
import {ActivityIndicator} from './ActivityIndicator';
import {StudioThumbnail} from './StudioHistory';
import {useImageEditSession} from './useImageEditSession';
import {imageEditPath,imageEditPending,imageEditVersions,type ImageEditMessage} from './imageEditTypes';
import type {StudioAIStudioConfig,StudioJob} from './studioTypes';
import './ResponseActivity.css';
import './ImageEditChat.css';

function useEditPreview(jobId:string){
 const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true,url='';const controller=new AbortController();setUrl('');setFailed(false);
  void fetch(`/api/images/${encodeURIComponent(jobId)}/image/0`,{headers:window.storageManager.getAuthHeaders(),signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const next=URL.createObjectURL(await response.blob());url=next;const image=new Image();image.src=next;await image.decode();if(alive)setUrl(next)}).catch(()=>{if(alive)setFailed(true)});
  return()=>{alive=false;controller.abort();if(url)URL.revokeObjectURL(url)};
 },[jobId]);
 return {url,failed};
}
export function ImageEditMessages({messages,onVersion,versions}:{messages:ImageEditMessage[];onVersion:(id:string)=>void;versions:Map<string,string>}){
 return <>{messages.map(message=><div key={message.id} className={`image-edit-message is-${message.role}`} data-message-id={message.id}>
  <span className="image-edit-message-role">{message.role==='user'?'Ты':'Nano Banana'}</span>
  {message.text&&<p>{message.text}</p>}
  {message.role==='model'&&message.job?.images?.length? <button type="button" className="image-edit-version-link" onClick={()=>onVersion(message.id)}><ImagePlus size={14}/>{versions.get(message.id)||'Показать изображение'}</button>:null}
  {message.role==='user'&&message.job?.status==='error'&&<div className="image-edit-message-error" role="alert">{message.job.error||'Не удалось изменить изображение.'}</div>}
  {message.role==='user'&&message.job?.status==='cancelled'&&<span className="image-edit-message-cancelled">Остановлено</span>}
 </div>)}</>;
}
export function ImageEditChat({source,userId,config,onClose,onNewImage,onJob}:{source:StudioJob;userId:string;config?:StudioAIStudioConfig;onClose:()=>void;onNewImage:()=>void;onJob:(job:StudioJob)=>void}){
 const edit=useImageEditSession(source,userId,onJob),[text,setText]=useState(''),[ratio,setRatio]=useState('auto'),[size,setSize]=useState('1K'),[selected,setSelected]=useState<string|null|undefined>(source.response_message_id),content=useRef<HTMLDivElement>(null),thread=useRef<HTMLDivElement>(null),versionTrack=useRef<HTMLDivElement>(null),textarea=useRef<HTMLTextAreaElement>(null),scrolling=useRef(true),previousAccepted=useRef(edit.accepted),submitted=useRef('');
 const pending=edit.sending||imageEditPending(edit.view?.active_job),versions=edit.view?imageEditVersions(edit.view):[{message_id:null,job:source,label:'Исходник'}];
 const path=edit.view?imageEditPath(edit.view.messages,edit.tailId||edit.parentId):[],activeVersion=[...versions].reverse().find(version=>version.message_id===null||path.some(message=>message.id===version.message_id))||versions[0],preview=versions.find(version=>version.message_id===(selected===undefined?activeVersion.message_id:selected))||activeVersion,branchRequired=selected!==undefined&&preview.message_id!==activeVersion.message_id;
 const image=useEditPreview(preview.job.id),versionLabels=new Map(versions.filter(version=>version.message_id).map(version=>[version.message_id!,version.label]));
 useEffect(()=>attachTouchScroll(textarea.current),[]);
 useEffect(()=>{if(edit.accepted!==previousAccepted.current){previousAccepted.current=edit.accepted;setText(value=>value===submitted.current?'':value);setSelected(undefined)}},[edit.accepted]);
 useEffect(()=>{if(scrolling.current&&thread.current)thread.current.scrollTop=thread.current.scrollHeight},[path.length,edit.view?.active_job?.status]);
 useEffect(()=>{const track=versionTrack.current,button=track?.querySelector<HTMLButtonElement>('[aria-pressed=true]');if(!track||!button)return;const left=button.offsetLeft-track.offsetLeft,right=left+button.offsetWidth;if(left<track.scrollLeft)track.scrollLeft=left;else if(right>track.scrollLeft+track.clientWidth)track.scrollLeft=right-track.clientWidth},[preview.message_id,versions.length]);
 const send=async()=>{if(pending||edit.uncertain||branchRequired||!config?.available)return;submitted.current=text;await edit.send(text,ratio,size)};
 const continueFrom=()=>{edit.branch(preview.message_id);setSelected(undefined);scrolling.current=true;textarea.current?.focus({preventScroll:true})};
 const ratios=config?.aspect_ratios?.length?config.aspect_ratios:['auto','1:1','3:4','4:3','9:16','16:9'];
 const sizes=config?.image_sizes?.length?config.image_sizes:['1K'],contextLimited=path.some(message=>message.job?.error_code==='image_context_limit');
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose()}}><Dialog.Portal><Dialog.Overlay className="image-edit-backdrop"/><Dialog.Content ref={content} className="image-edit-chat" aria-describedby={undefined} onOpenAutoFocus={event=>{event.preventDefault();content.current?.focus({preventScroll:true})}} onCloseAutoFocus={event=>event.preventDefault()}>
  <header className="image-edit-heading"><div><Dialog.Title>Редактировать изображение</Dialog.Title><span>Nano Banana 2.1</span></div><Button type="button" variant="ghost" className="image-edit-new" aria-label="Новая картинка" disabled={pending||edit.uncertain} onClick={onNewImage}><ImagePlus size={16}/><span>Новая картинка</span></Button><IconButton label="Закрыть редактирование" onClick={onClose}><X size={18}/></IconButton></header>
  <div className="image-edit-layout"><section className="image-edit-art" aria-label="Версии изображения"><div className="image-edit-preview" aria-busy={!image.url&&!image.failed}>{image.url?<img src={image.url} alt={preview.label}/>:image.failed?<p role="status">Не удалось открыть изображение.</p>:<Loader2 size={24} className="spin"/>}<span className="image-edit-preview-label">{preview.label}</span></div><div ref={versionTrack} className="image-edit-versions" role="group" aria-label="Выбрать версию">{versions.map(version=><button key={version.message_id||'root'} type="button" aria-label={`Показать ${version.label.toLowerCase().replace("версия", "версию")}`} aria-pressed={version.message_id===preview.message_id} onClick={()=>setSelected(version.message_id)}><StudioThumbnail job={version.job}/><span>{version.label}</span></button>)}</div>{branchRequired&&<div className="image-edit-branch"><span>Просмотр предыдущей версии</span><Button type="button" variant="outline" disabled={pending} onClick={continueFrom}><GitBranch size={14}/>Продолжить отсюда</Button></div>}</section>
  <section className="image-edit-conversation" aria-label="Диалог об изменениях"><div ref={thread} className="image-edit-messages" onScroll={event=>{const node=event.currentTarget;scrolling.current=node.scrollHeight-node.scrollTop-node.clientHeight<48}}>
   {edit.loading?<ActivityIndicator kind="processing" label="Открываю редактирование…"/>:!path.length?<p className="image-edit-welcome">Опиши, что изменить. Можно продолжать уточнять результат в этом диалоге.</p>:<ImageEditMessages messages={path} versions={versionLabels} onVersion={setSelected}/>}
   {imageEditPending(edit.view?.active_job)&&<ActivityIndicator kind="image" label="Изменяю изображение…"/>}
  </div><form className="image-edit-composer" onSubmit={event=>{event.preventDefault();void send()}}>
   {edit.error&&<p className="image-edit-error" role="alert">{edit.error}{!edit.view&&<button type="button" onClick={()=>void edit.refresh()}>Повторить</button>}</p>}
   {edit.uncertain&&<Button type="button" variant="outline" className="image-edit-recovery" disabled={pending} onClick={()=>void edit.retry()}>Повторить отправку</Button>}
   {contextLimited&&<Button type="button" variant="outline" className="image-edit-recovery" disabled={pending||edit.uncertain} onClick={()=>void edit.restart(preview.job.id)}>Начать новую цепочку с этой версии</Button>}
   {config&&!config.available&&<p className="image-edit-error" role="status">{config.reason||'Подключи AI Studio в настройках, чтобы редактировать изображение.'}</p>}
   <label className="sr-only" htmlFor="image-edit-prompt">Изменения изображения</label><textarea id="image-edit-prompt" ref={textarea} aria-label="Изменения изображения" placeholder={branchRequired?'Выбери «Продолжить отсюда» для этой версии…':'Что изменить в изображении?'} value={text} onChange={event=>setText(event.target.value)} disabled={edit.loading||branchRequired} maxLength={16000} rows={3} onKeyDown={event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void send()}}}/>
   <div className="image-edit-compose-actions"><Select aria-label="Формат редактирования" value={ratio} onChange={event=>setRatio(event.target.value)} disabled={pending||edit.loading}>{ratios.map(value=><SelectOption key={value} value={value}>{value==='auto'?'Авто':value}</SelectOption>)}</Select><Select aria-label="Разрешение редактирования" value={size} onChange={event=>setSize(event.target.value)} disabled={pending||edit.loading}>{sizes.map(value=><SelectOption key={value} value={value}>{value}</SelectOption>)}</Select><span className="image-edit-size"/>{pending?<IconButton label="Остановить редактирование" disabled={edit.sending&&!edit.view?.active_job} onClick={()=>void edit.stop()}><Square size={18}/></IconButton>:<IconButton label="Отправить изменения" className="image-edit-send" disabled={edit.loading||edit.uncertain||!edit.view||!text.trim()||branchRequired||!config?.available} onClick={()=>void send()}><ArrowUp size={18}/></IconButton>}</div>
  </form></section></div>
 </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
