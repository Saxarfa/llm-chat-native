import {memo,useLayoutEffect,useRef,type RefObject} from 'react';
import {installIOSKeyboardFocusGuard,isIOSWebKit} from '../iosKeyboardFocus';

export type EditorCallbacks={input:(text:string)=>void;blur:()=>void;composition:(active:boolean)=>void;paste:(event:ClipboardEvent)=>void;drop:(event:DragEvent)=>void;key:(event:KeyboardEvent)=>void};

/** iOS edits in a small ordinary document, matching the device comparison
 * fields. App CSS and document listeners cannot intercept native text editing.
 * React owns only the host; the native field stays stable for its lifetime. */
export const ChatComposerEditor=memo(function ChatComposerEditor({field,callbacks,hint,disabled,readOnly=false,welcome,label='Сообщение',maxLength}:{
 field:RefObject<HTMLTextAreaElement|null>;callbacks:RefObject<EditorCallbacks>;hint:string;disabled:boolean;readOnly?:boolean;welcome:boolean;label?:string;maxLength?:number;
}){
 const blocked=useRef(readOnly);blocked.current=readOnly;
 const host=useRef<HTMLDivElement>(null),refresh=useRef<(()=>void)|undefined>(undefined);
 const isolated=isIOSWebKit(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
 useLayoutEffect(()=>{
  const owner=host.current;if(!owner)return;
  const parentDoc=owner.ownerDocument,parentWin=parentDoc.defaultView!;
  let frame:HTMLIFrameElement|undefined,doc=parentDoc;
  if(isolated){
   frame=parentDoc.createElement('iframe');frame.title=label;frame.className='chat-composer-editor-frame';
   // A synchronous initial empty document lets the parent's layout effect
   // restore its draft before paint, without a second asynchronous mount.
   owner.append(frame);doc=frame.contentDocument!;
   doc.open();doc.write('<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');doc.close();
   const style=doc.createElement('style');style.textContent=`
    html,body{margin:0;padding:0;width:100%;background:transparent;overflow:hidden;-webkit-tap-highlight-color:transparent}
    html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
    textarea{display:block;position:static;box-sizing:border-box;width:100%;min-width:0;height:56px;min-height:var(--editor-min,32px);max-height:160px;
     margin:0;padding:var(--editor-padding,4px 0);border:0;border-radius:0;background:transparent;color:var(--editor-ink);outline:none;box-shadow:none;
     font:400 max(16px,var(--editor-size,16px))/24px var(--editor-font,var(--font-ui));letter-spacing:normal;
     resize:none;overflow:auto;white-space:pre-wrap;overflow-wrap:break-word;field-sizing:fixed;touch-action:auto;-webkit-tap-highlight-color:transparent}
    textarea:focus,textarea:focus-visible,textarea:active{outline:0;box-shadow:none;border:0;background:transparent}
    textarea::placeholder{color:var(--editor-muted);opacity:1}
    textarea:placeholder-shown{white-space:pre;overflow-x:hidden;text-overflow:ellipsis}
    @supports(field-sizing:content){textarea{height:auto;field-sizing:content}}
   `;doc.head.append(style);
  }
  const input=doc.createElement('textarea');
  input.id='message-input';input.className='chat-composer-input';input.rows=2;
  input.setAttribute('aria-label',label);if(maxLength)input.maxLength=maxLength;input.setAttribute('autocorrect','on');input.setAttribute('autocomplete','on');input.spellcheck=true;
  const changed=()=>callbacks.current.input(input.value);
  const blur=()=>{input.readOnly=blocked.current;callbacks.current.blur();parentWin.dispatchEvent(new Event('composer-blur'))};
  const start=()=>callbacks.current.composition(true),end=()=>{callbacks.current.composition(false);changed()};
  const paste=(event:ClipboardEvent)=>callbacks.current.paste(event);
  const drag=(event:DragEvent)=>event.preventDefault(),drop=(event:DragEvent)=>callbacks.current.drop(event);
  const key=(event:KeyboardEvent)=>{
   // Only explicit app shortcuts cross the document boundary. Ordinary typing,
   // selection, IME and native touch events stay entirely inside the editor.
   if(isolated&&(event.ctrlKey||event.metaKey)&&['k','b',','].includes(event.key.toLowerCase())){
    event.preventDefault();parentWin.dispatchEvent(new KeyboardEvent('keydown',{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey,bubbles:true,cancelable:true}));return;
   }
   callbacks.current.key(event);
  };
  const focus=()=>parentWin.dispatchEvent(new Event('composer-focus'));
  const beforeInput=(event:InputEvent)=>{if(blocked.current&&event.cancelable)event.preventDefault()};
  input.addEventListener('beforeinput',beforeInput);input.addEventListener('input',changed);input.addEventListener('blur',blur);input.addEventListener('focus',focus);
  input.addEventListener('compositionstart',start);input.addEventListener('compositionend',end);input.addEventListener('paste',paste);input.addEventListener('keydown',key);
  if(isolated){input.addEventListener('dragover',drag);input.addEventListener('drop',drop)}
  (frame?doc.body:owner).append(input);field.current=input;
  // Touch events do not cross the iframe boundary. Install only the focus
  // guard here; typing/IME remain local to this small native document.
  const removeFocusGuard=frame?installIOSKeyboardFocusGuard(doc,parentWin,input):()=>{};
  let paint:number|undefined,lastHeight=0;
  const observer=new ResizeObserver(entries=>{
   const height=frame?entries[0]?.borderBoxSize?.[0]?.blockSize??(entries[0]?.contentRect.height||0)+8:entries[0]?.contentRect.height;
   if(!height||height===lastHeight)return;lastHeight=height;
   // Changing an iframe viewport from a resize delivery can start a resize
   // notification loop. Commit its outer box at the next parent paint instead.
   if(paint===undefined)paint=parentWin.requestAnimationFrame(()=>{
    paint=undefined;if(frame)frame.style.height=`${Math.min(160,lastHeight)}px`;
    parentWin.dispatchEvent(new Event('composer-height-changed'));
   });
  });observer.observe(frame?input:owner);
  const theme=()=>{
   if(!frame)return;
   const css=parentWin.getComputedStyle(owner),root=doc.documentElement;
   root.style.setProperty('--editor-size',css.getPropertyValue('--chat-input-size').trim()||'16px');
   root.style.setProperty('--editor-font',css.fontFamily);
   root.style.setProperty('--editor-ink',css.color);
   root.style.setProperty('--editor-muted',css.getPropertyValue('--chat-hint').trim()||css.color);
   root.style.setProperty('--editor-min',css.getPropertyValue('--chat-input-min').trim()||'32px');
   root.style.setProperty('--editor-padding',css.getPropertyValue('--chat-input-padding').trim()||'4px 0');
   root.style.colorScheme=parentDoc.documentElement.dataset.theme==='light'?'light':'dark';
  };
  const attributes=new MutationObserver(theme);
  if(frame){attributes.observe(parentDoc.documentElement,{attributes:true,attributeFilter:['data-theme','data-ui-size']});attributes.observe(owner,{attributes:true,attributeFilter:['data-welcome']});theme()}
  refresh.current=theme;
  return()=>{
   removeFocusGuard();
   attributes.disconnect();observer.disconnect();if(paint!==undefined)parentWin.cancelAnimationFrame(paint);refresh.current=undefined;
   input.removeEventListener('beforeinput',beforeInput);input.removeEventListener('input',changed);input.removeEventListener('blur',blur);input.removeEventListener('focus',focus);
   input.removeEventListener('compositionstart',start);input.removeEventListener('compositionend',end);input.removeEventListener('paste',paste);input.removeEventListener('keydown',key);
   input.removeEventListener('dragover',drag);input.removeEventListener('drop',drop);
   if(field.current===input)field.current=null;input.remove();frame?.remove();
  };
 },[field,callbacks,isolated,label,maxLength]);
 useLayoutEffect(()=>{if(field.current)field.current.placeholder=hint},[field,hint]);
 useLayoutEffect(()=>{if(field.current)field.current.disabled=disabled},[field,disabled]);
 useLayoutEffect(()=>{if(field.current){field.current.readOnly=readOnly&&field.current.ownerDocument.activeElement!==field.current;field.current.setAttribute('aria-readonly',String(readOnly));field.current.setAttribute('aria-busy',String(readOnly))}},[field,readOnly]);
 useLayoutEffect(()=>{refresh.current?.()},[welcome]);
 return <div className="chat-composer-editor" data-welcome={welcome} ref={host}/>;
});
