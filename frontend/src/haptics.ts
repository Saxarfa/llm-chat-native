import {nativeHaptic,nativeTheme} from './native/runtime';
export type HapticKind=
 |'light'
 |'medium'
 |'heavy'
 |'soft'
 |'rigid'
 |'success'
 |'selection'
 |'send'
 |'stop'
 |'mic_start'
 |'mic_stop'
 |'first_token'
 |'phase'
 |'token'
 |'sidebar'
 |'star'
 |'complete'
 |'error';

interface NativeWebKitBridge{
 messageHandlers?:{
  llmNativeHaptics?:{
   postMessage:(payload:Record<string,unknown>)=>void;
  };
 };
}

declare global{
 interface Window{
  webkit?:NativeWebKitBridge;
  __IS_LLM_NATIVE_IOS__?:boolean;
 }
}

let lastHapticAt=0;
let lastStreamTokenAt=0;
let iosSwitchLabel:HTMLLabelElement|null=null;

function prefersReducedMotion():boolean{
 try{return typeof window!=='undefined'&&!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}catch{return false}
}

function isCoarseTouch():boolean{
 try{
  if(typeof window==='undefined')return false;
  if(window.webkit?.messageHandlers?.llmNativeHaptics)return true;
  return !!window.matchMedia?.('(pointer: coarse)').matches||/iPad|iPhone|iPod|Android/i.test(navigator.userAgent||'');
 }catch{return false}
}

function postNativeHaptic(type:string,extra?:Record<string,unknown>):boolean{
 try{
  const handler=typeof window!=='undefined'?window.webkit?.messageHandlers?.llmNativeHaptics:undefined;
  if(handler&&typeof handler.postMessage==='function'){
   handler.postMessage(extra?{type,...extra}:{type});
   return true;
  }
 }catch{}
 return false;
}

function mapKindToNativeType(kind:HapticKind):string{
 switch(kind){
  case 'selection':return 'select';
  case 'success':return 'complete';
  default:return kind;
 }
}

function ensureIOSSwitch():HTMLLabelElement|null{
 if(typeof document==='undefined'||!document.body)return null;
 if(iosSwitchLabel&&iosSwitchLabel.isConnected)return iosSwitchLabel;
 try{
  const label=document.createElement('label');
  label.setAttribute('aria-hidden','true');
  // WebKit's label activation still toggles an inert switch, but cannot focus
  // it. A focusable hidden checkbox steals focus from the iframe editor,
  // dismisses its keyboard and is included in Safari's form navigation.
  label.inert=true;
  label.dataset.hapticSwitch='true';
  label.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  const input=document.createElement('input');
  input.type='checkbox';
  input.setAttribute('switch','');
  input.tabIndex=-1;
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitchLabel=label;
  return label;
 }catch{return null}
}

/**
 * Triggers native tactile feedback on mobile devices:
 * - Native iOS 27 app (iPhone Air): CoreHaptics CHHapticEngine + Taptic Engine via WKScriptMessageHandler
 * - iOS 17.4+ / 18+ Safari & Home Screen PWA: native WebKit switch Taptic Engine
 * - Android / Chrome: navigator.vibrate
 * Respects prefers-reduced-motion and throttles rapid bursts.
 */
export function triggerHaptic(kind:HapticKind='light'):boolean{
 if(prefersReducedMotion()||!isCoarseTouch())return false;
 const now=Date.now();
 if(now-lastHapticAt<40)return false;
 lastHapticAt=now;
 try{
  if(nativeHaptic(kind))return true;
  if(postNativeHaptic(mapKindToNativeType(kind))){
   return true;
  }
  if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'){
   const pattern=
    kind==='send'?[10,36,16]
    :kind==='stop'||kind==='error'?[18,40,18]
    :kind==='success'||kind==='complete'?[8,36,10]
    :kind==='medium'||kind==='sidebar'||kind==='star'?14
    :8;
   navigator.vibrate(pattern);
   return true;
  }
  const label=ensureIOSSwitch();
  if(label){
   label.click();
   return true;
  }
 }catch{}
 return false;
}

/**
 * Gemini-style silk micro-haptic during active token streaming on word/punctuation boundaries.
 * Fires via the native iOS CoreHaptics bridge (throttled >= 65ms) so browser DOM switches are not spammed.
 */
export function triggerStreamTokenHaptic(deltaOrText:string):boolean{
 if(!deltaOrText||prefersReducedMotion())return false;
 const now=Date.now();
 if(now-lastStreamTokenAt<65)return false;
 if(!/[\s.,!?;:\n)\]]$/.test(deltaOrText))return false;
 lastStreamTokenAt=now;
 return postNativeHaptic('token',{boundary:true});
}

export function syncNativeTheme(theme:'oled'|'dark'|'light'):void{
 nativeTheme(theme);
 postNativeHaptic('theme',{theme});
}

export function resetHapticThrottleForTests(){
 lastHapticAt=0;
 lastStreamTokenAt=0;
 iosSwitchLabel=null;
}
