import {useLayoutEffect} from 'react';
import {viewportFrame,viewportLayout} from './viewportGeometry';
import {installIOSKeyboardFocusGuard} from './iosKeyboardFocus';
import {isNativeIOS} from './native/platform';

/** The iOS keyboard travels on a critically damped spring that settles in about
 * 400 ms (screen recording IMG_1134, 11.11.2026, measured frame by frame; the
 * matching curve is --keyboard-ease in mobileApp.css). Safari reports the new
 * viewport late and in one step, so the dock starts on focus/blur instead and
 * ignores Safari's stale samples for KEYBOARD_WINDOW_MS. */
export const KEYBOARD_MOTION_MS=400,KEYBOARD_WINDOW_MS=600;
const KEYBOARD_MEMORY_KEY='saxara_keyboard_inset';

// Keep the chat layout fixed while the keyboard animates. Only the dock's
// inset and the Safari pan compensation follow the visible viewport.
export function useMobileViewport(mobile:boolean){
 useLayoutEffect(()=>{
  // Capacitor Keyboard notifications own native geometry; do not run a second
  // visualViewport/focus predictor against its unresized WKWebView.
  if(isNativeIOS())return;
  const viewport=window.visualViewport,root=document.documentElement;
  const properties=['--app-height','--viewport-top','--visible-height','--keyboard-inset','--keyboard-motion-duration'];
  const reset=()=>{properties.forEach(property=>root.style.removeProperty(property));delete root.dataset.keyboard;delete root.dataset.viewportResizing};
  if(!mobile||!viewport){reset();return}
  let layout={height:viewport.height,width:innerWidth,frozen:false},frame=0,settleFrame=0,timer:ReturnType<typeof setTimeout>|undefined,lastH=viewport.height,lastTop=viewport.offsetTop;
  const removeFocusGuard=installIOSKeyboardFocusGuard(document,window);
  const focused=()=>{
   let element=document.activeElement;
   // The isolated iOS editor belongs to another Window. Its native controls
   // are not instances of this document's HTMLElement, and parent focus events
   // stop at the iframe boundary. Cross-origin frames are not editable here.
   while(element?.tagName==='IFRAME'){
    try{element=(element as HTMLIFrameElement).contentDocument?.activeElement??null}catch{return false}
   }
   return !!element&&((element as HTMLElement).isContentEditable||element.matches('textarea:not([readonly]):not([disabled]),input:not([readonly]):not([disabled]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=color]):not([type=hidden])'));
  };
  const write=(name:string,value:number)=>{const next=`${Math.round(value*100)/100}px`;if(root.style.getPropertyValue(name)!==next)root.style.setProperty(name,next)};
  let lastSample='',presentedHeight=viewport.height,dismissUntil=0,openUntil=0,motionUntil=0,windowTimer:ReturnType<typeof setTimeout>|undefined;
  // Height of the keyboard the last time it was open at this screen width.
  // It lets the dock leave with the keyboard on focus, before Safari reports.
  const memoryKey=()=>`${KEYBOARD_MEMORY_KEY}:${innerWidth}`;
  const recall=()=>{try{return Number(localStorage.getItem(memoryKey()))||0}catch{return 0}};
  let remembered=recall(),rememberedWidth=innerWidth;
  const remember=(inset:number)=>{
   if(Math.abs(inset-remembered)<.5)return;remembered=inset;
   try{if(inset)localStorage.setItem(memoryKey(),String(Math.round(inset)));else localStorage.removeItem(memoryKey())}catch{/* storage unavailable */}
  };
  const glide=(ms:number)=>{const value=`${ms}ms`;if(root.style.getPropertyValue('--keyboard-motion-duration')!==value)root.style.setProperty('--keyboard-motion-duration',value);if(ms)motionUntil=performance.now()+ms};
  const update=(settled=false)=>{
   // Preserve pinch zoom; it is not a keyboard resize.
   if(Math.abs(viewport.scale-1)>.015)return;
   const editing=focused(),sample=`${viewport.height}:${viewport.offsetTop}:${innerWidth}:${editing}`;
   if(!settled&&sample===lastSample)return;lastSample=sample;
   if(innerWidth!==rememberedWidth){rememberedWidth=innerWidth;remembered=recall()}
   const now=performance.now(),closing=!editing&&now<dismissUntil,opening=editing&&now<openUntil&&remembered>80;
   // Dense native keyboard samples already describe the animation. Applying
   // another CSS transition to each one makes the dock trail under the keys.
   // Only interpolate a coarse browser jump; follow small samples directly.
   // An anticipated motion is already running on the keyboard's own timing:
   // Safari's late sample must not retime it.
   const step=Math.abs(viewport.height-presentedHeight);
   if(step>.5){if(!closing&&!opening)glide(step>64?KEYBOARD_MOTION_MS:0);presentedHeight=viewport.height}
   // Only rotation needs a fresh layout viewport. Reading clientHeight after
   // changing a root CSS variable forced a style/layout flush on keyboard samples.
   const layoutHeight=Math.abs(innerWidth-layout.width)>50?Math.max(innerHeight,root.clientHeight):layout.height;
   layout=viewportLayout(layout,{height:viewport.height,width:innerWidth,layoutHeight,focused:editing,settled});
   const reported=viewportFrame(viewport.height,viewport.offsetTop,layout.height);
   // iPhone: Safari reports the keyboard closing ~100 ms after it starts
   // sliding away, and then in one step — the dock waited and teleported
   // (screen recording 08.11.2026). After our own editor blur the keyboard is
   // known to be leaving: drop the inset at once and ignore stale samples.
   // Opening is the mirror case: the keyboard is already rising while Safari
   // still reports the full screen, so hold the remembered keyboard height.
   const lifted=Math.max(remembered,reported.inset);
   const geometry=closing?{...reported,inset:0,visibleHeight:reported.height}:opening?{...reported,inset:lifted,visibleHeight:reported.height-lifted}:reported;
   if(settled&&editing&&!opening&&reported.inset>80)remember(reported.inset);
   write('--app-height',geometry.height);write('--visible-height',geometry.visibleHeight);
   write('--viewport-top',geometry.top);write('--keyboard-inset',geometry.inset);
   const keyboard=String(geometry.inset>80);if(root.dataset.keyboard!==keyboard)root.dataset.keyboard=keyboard;
   // Welcome and conversation now share an absolute bottom dock. Its height
   // belongs to the dock's ResizeObserver; keyboard motion needs no DOM measure.
  };
  // Safari can pan between resize/scroll notifications. Sample each paint
  // throughout the transition, rather than compensate one event frame late.
  const track=()=>{lastH=viewport.height;lastTop=viewport.offsetTop;update();frame=requestAnimationFrame(track)};
  const schedule=()=>{
   lastH=viewport.height;lastTop=viewport.offsetTop;
   if(root.dataset.viewportResizing!=='true'){
    root.dataset.viewportResizing='true';window.dispatchEvent(new Event('mobile-viewport-changing'));
   }
   cancelAnimationFrame(settleFrame);clearTimeout(timer);
   update();
   if(!frame)frame=requestAnimationFrame(track);
   timer=setTimeout(()=>{
    cancelAnimationFrame(frame);frame=0;update(true);
    settleFrame=requestAnimationFrame(()=>{delete root.dataset.viewportResizing;window.dispatchEvent(new Event('mobile-viewport-settled'))});
   },Math.max(220,motionUntil-performance.now()+40));
  };
  // Start a motion now and reconcile with what Safari reports once the
  // keyboard has certainly finished.
  const anticipate=()=>{
   glide(KEYBOARD_MOTION_MS);lastSample='';clearTimeout(windowTimer);
   windowTimer=setTimeout(()=>{
    // No keyboard came up (hardware keyboard): stop anticipating one.
    if(openUntil&&focused()&&viewportFrame(viewport.height,viewport.offsetTop,layout.height).inset<=80)remember(0);
    const actual=viewportFrame(viewport.height,viewport.offsetTop,layout.height).inset,shown=parseFloat(root.style.getPropertyValue('--keyboard-inset'))||0;
    openUntil=dismissUntil=0;lastSample='';
    if(Math.abs(actual-shown)>.5){glide(KEYBOARD_MOTION_MS);schedule()}
   },KEYBOARD_WINDOW_MS);
   schedule();
  };
  const onGeometry=()=>{if(Math.abs(viewport.height-lastH)<.5&&Math.abs(viewport.offsetTop-lastTop)<.5&&innerWidth===layout.width)return;schedule()};
  const focusChanged=()=>{if(focused()||layout.frozen)schedule()};
  // The composer editor took focus with the keyboard down: lift the dock with
  // the keyboard, to the height it had last time, instead of after Safari.
  const composerFocus=()=>{
   if(root.dataset.keyboard!=='true'&&remembered>80&&focused()){dismissUntil=0;openUntil=performance.now()+KEYBOARD_WINDOW_MS;anticipate()}
   focusChanged();
  };
  // The composer editor lost focus while the keyboard was up: move the dock
  // down with the keyboard on the same spring instead of after Safari.
  const composerBlur=()=>{
   if(root.dataset.keyboard==='true'&&!focused()){openUntil=0;dismissUntil=performance.now()+KEYBOARD_WINDOW_MS;anticipate()}
   focusChanged();
  };
  viewport.addEventListener('resize',onGeometry);viewport.addEventListener('scroll',onGeometry);
  window.addEventListener('resize',onGeometry);document.addEventListener('focusin',focusChanged);document.addEventListener('focusout',focusChanged);
  window.addEventListener('composer-focus',composerFocus);window.addEventListener('composer-blur',composerBlur);
  update();
  return()=>{window.removeEventListener('composer-focus',composerFocus);window.removeEventListener('composer-blur',composerBlur);clearTimeout(windowTimer);removeFocusGuard();cancelAnimationFrame(frame);cancelAnimationFrame(settleFrame);clearTimeout(timer);viewport.removeEventListener('resize',onGeometry);viewport.removeEventListener('scroll',onGeometry);window.removeEventListener('resize',onGeometry);document.removeEventListener('focusin',focusChanged);document.removeEventListener('focusout',focusChanged);reset()};
 },[mobile]);
}
