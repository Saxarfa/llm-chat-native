import {useSettingsScope} from './SettingsScope';
import {useSurfaceSwipe} from '../useSurfaceSwipe';
import {useState,useEffect,useLayoutEffect,useRef,useId,type ReactNode,type ComponentProps} from 'react';
import {Hint} from './Hint';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {afterSurfaceMotion} from '../surfaceCompletion';
import {surfaceOpener} from '../surfaceFocus';
import {AnimatePresence} from 'motion/react';
import {RevealRegion} from './Reveal';
import {ChevronDown,Check,Copy} from '../icons';
import {StateTransition} from './StateTransition';
import {useChevronGlide} from '../useChevronGlide';
import {safeImage} from '../domain';
import {failure} from '../store';
import {triggerHaptic} from '../haptics';
import {probeWindow} from '../motionProbe';
import {presentSheet} from '../motionProfile';
export {Button};
export function IconButton({label,children,className='',showHint=true,disabledReason,...props}:ComponentProps<typeof Button>&{label:string;showHint?:boolean;disabledReason?:string}){
 const button=<Button type="button" variant="ghost" size="icon" aria-label={label} className={`icon-button ${className}`} {...props}>{children}</Button>;
 // Disabled controls swallow pointer events, so the tooltip hangs on a wrapper and explains why it is blocked.
 if(props.disabled&&disabledReason)return <Hint text={disabledReason}><span className="hint-anchor">{button}</span></Hint>;
 return <Hint text={showHint?label:undefined}>{button}</Hint>;
}
export function Avatar({src,name,size='normal'}:{src?:string;name:string;size?:string}){const[failedSource,setFailedSource]=useState<string>();return <span className={`avatar avatar-${size}`} aria-hidden="true">{safeImage(src)&&failedSource!==src?<img src={src} alt="" onError={()=>setFailedSource(src)} referrerPolicy="no-referrer"/>:<span>{src&&!safeImage(src)?src.slice(0,4):name.slice(0,1).toUpperCase()}</span>}</span>}
export function Modal(props:ComponentProps<typeof ModalDialog>){
 const settings=useSettingsScope();
 if(settings&&/lora-library-modal|lora-note-modal|memory-editor/.test(props.className||''))return <ModalDialog {...props} className={`settings-ux ${props.className}`}/>;
 return <ModalDialog {...props}/>;
}
function ModalDialog({open,onClose,onAfterClose,title,description,children,className='',persistent=false,onEscapeKeyDown,fallbackFocus}:{open:boolean;onClose:()=>void;onAfterClose?:()=>void;title:string;description?:string;children:ReactNode;className?:string;persistent?:boolean;onEscapeKeyDown?:ComponentProps<typeof DialogContent>['onEscapeKeyDown'];fallbackFocus?:string}){
 const settingsScope=useSettingsScope(),confirmation=settingsScope&&!className.includes('settings-ux');
 const [closing,setClosing]=useState(false),descriptionId=useId(),content=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),previous=useRef(open),entered=useRef(open),completion=useRef<(()=>void)|null>(null);
 const callbacks=useRef({onClose,onAfterClose});callbacks.current={onClose,onAfterClose};
 const shown=open&&!closing;
 useLayoutEffect(()=>{
  // A controlled reopen cancels an obsolete completion from the old request.
  if(open&&!previous.current){completion.current?.();completion.current=null;setClosing(false)}
  previous.current=open;
 },[open]);
 useLayoutEffect(()=>{
  completion.current?.();completion.current=null;
  if(shown){entered.current=true;return}
  if(!entered.current)return;
  if(!closing&&!callbacks.current.onAfterClose)return;
  completion.current=afterSurfaceMotion(content.current,()=>{completion.current=null;entered.current=false;if(callbacks.current.onAfterClose)callbacks.current.onAfterClose();else callbacks.current.onClose()});
  return()=>{completion.current?.();completion.current=null};
 },[shown,closing]);
 useEffect(()=>()=>completion.current?.(),[]);
 const requestClose=()=>{if(closing)return;if(persistent){callbacks.current.onClose();return}setClosing(true)};
 useSurfaceSwipe(content,'.modal-heading',requestClose,shown);
 // Radix mounts portal content in a later commit; hold the sheet when the node attaches.
 const attach=useRef((node:HTMLDivElement|null)=>{content.current=node;if(!node)return;const release=presentSheet(node);return()=>{release();if(content.current===node)content.current=null}}).current;
 useEffect(()=>{if(shown)probeWindow('modal','open',520);else if(entered.current)probeWindow('modal','close',520)},[shown]);
 return <Dialog open={shown} onOpenChange={value=>{if(!value)requestClose()}}><DialogContent ref={attach} onEscapeKeyDown={onEscapeKeyDown} onOpenAutoFocus={event=>{event.preventDefault();opener.current=surfaceOpener();(confirmation?content.current?.querySelector<HTMLElement>('.confirm-actions button:not([disabled]),.modal-actions button:not([disabled])')||content.current:content.current)?.focus({preventScroll:true})}} onCloseAutoFocus={event=>{event.preventDefault();const restore=()=>{const available=(element:HTMLElement)=>element.isConnected&&element.getClientRects().length>0&&!element.closest('[inert],[aria-hidden="true"]');const target=opener.current&&available(opener.current)?opener.current:fallbackFocus?Array.from(document.querySelectorAll<HTMLElement>(fallbackFocus)).find(available):null;target?.focus({preventScroll:true})};restore();if(fallbackFocus)requestAnimationFrame(()=>{if(document.activeElement===document.body)restore()})}} className={`premium-modal ${confirmation?'settings-confirm':''} ${className}`} aria-describedby={description?descriptionId:undefined} inert={!shown} data-surface-phase={shown?'shown':'exiting'}><div className="modal-heading"><DialogTitle>{title}</DialogTitle>{description&&<DialogDescription id={descriptionId}>{description}</DialogDescription>}</div>{children}</DialogContent></Dialog>;
}
export function Disclosure({title,children,initial=false,className='',busy=false,onOpenChange,onTransitionComplete}:{title:ReactNode;children:ReactNode;initial?:boolean;className?:string;busy?:boolean;onOpenChange?:(open:boolean)=>void;onTransitionComplete?:(open:boolean)=>void}){const[open,setOpen]=useState(initial),id=useId(),chevron=useRef<SVGSVGElement>(null);useChevronGlide(chevron);return <div className={`disclosure ${className} ${busy?'busy':''}`}><button type="button" className="disclosure-trigger" aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(!open);onOpenChange?.(!open)}}><span>{title}</span><ChevronDown ref={chevron} size={14} className={open?'rotated':''}/></button><AnimatePresence initial={false}>{open&&<RevealRegion id={id} className="disclosure-clip" contentClassName="disclosure-body" onComplete={onTransitionComplete}>{children}</RevealRegion>}</AnimatePresence></div>}
export async function copyText(text:string){if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return}const field=document.createElement('textarea');field.value=text;field.style.cssText='position:fixed;opacity:0';document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)throw new Error('Копирование недоступно в браузере')}
export function CopyButton({text,label='Скопировать',showLabel=false}:{text:string;label?:string;showLabel?:boolean}){
 const[copied,setCopied]=useState(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <IconButton label={copied?'Скопировано':label} className={showLabel?'copy-text-action':''} onClick={()=>{void copyText(text).then(()=>{triggerHaptic('light');clearTimeout(timer.current);setCopied(true);timer.current=setTimeout(()=>setCopied(false),1800)}).catch(failure)}}><span className="copy-feedback" aria-hidden="true"><StateTransition stateKey={copied?'done':'copy'} className="is-icon">{copied?<Check size={16} className="copy-success-mark"/>:<Copy size={16}/>}</StateTransition></span>{showLabel&&<span className="copy-action-label" aria-hidden="true">{copied?'Скопировано':'Скопировать'}</span>}</IconButton>;
}
