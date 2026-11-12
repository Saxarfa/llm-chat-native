import {App} from '@capacitor/app';
import {Haptics,ImpactStyle,NotificationType} from '@capacitor/haptics';
import {StatusBar,Style} from '@capacitor/status-bar';
import {Keyboard,KeyboardStyle} from '@capacitor/keyboard';
import {SplashScreen} from '@capacitor/splash-screen';
import {LocalNotifications} from '@capacitor/local-notifications';
import {flushNativeStorage} from './storage';
import {installNativeSharing} from './files';
import {isNativeIOS} from './platform';

export let nativePermission:NotificationPermission='default';
export async function refreshNativePermission(){
 const {display}=await LocalNotifications.checkPermissions();
 nativePermission=display==='granted'?'granted':display==='denied'?'denied':'default';
 window.dispatchEvent(new Event('native-notification-permission'));
}
export async function requestNativeNotifications(){
 await LocalNotifications.requestPermissions();await refreshNativePermission();return nativePermission==='granted';
}
export async function nativeNotification(title:string,body:string,tag:string,data:Record<string,unknown>){
 let id=0;for(const c of tag)id=(Math.imul(id,31)+c.charCodeAt(0))|0;
 await LocalNotifications.schedule({notifications:[{id:Math.abs(id)||1,title,body,extra:data}]});
}
export function nativeHaptic(kind:string){
 if(!isNativeIOS())return false;
 const promise=kind==='error'?Haptics.notification({type:NotificationType.Error})
  :kind==='success'||kind==='complete'?Haptics.notification({type:NotificationType.Success})
  :kind==='selection'?Haptics.selectionChanged()
  :Haptics.impact({style:kind==='heavy'?ImpactStyle.Heavy:kind==='medium'||kind==='send'?ImpactStyle.Medium:ImpactStyle.Light});
 void promise.catch(()=>{});return true;
}
export function nativeTheme(theme:'oled'|'dark'|'light'){
 if(!isNativeIOS())return;
 void StatusBar.setStyle({style:theme==='light'?Style.Light:Style.Dark}).catch(()=>{});
 void Keyboard.setStyle({style:theme==='light'?KeyboardStyle.Light:KeyboardStyle.Dark}).catch(()=>{});
}
export async function initializeNativeRuntime(){
 installNativeSharing();
 await refreshNativePermission();
 await Keyboard.setAccessoryBarVisible({isVisible:true});
 const root=document.documentElement;
 let inset=0,timer:ReturnType<typeof setTimeout>|undefined;
 const layout=()=>{
  const height=innerHeight;
  root.style.setProperty('--app-height',height+'px');
  root.style.setProperty('--visible-height',Math.max(0,height-inset)+'px');
  root.style.setProperty('--viewport-top','0px');
 };
 const keyboard=(height:number)=>{
  inset=height;root.dataset.keyboard=String(height>0);root.dataset.viewportResizing='true';
  root.style.setProperty('--keyboard-inset',height+'px');root.style.setProperty('--keyboard-motion-duration','400ms');
  layout();window.dispatchEvent(new Event('mobile-viewport-changing'));
  if(height)requestAnimationFrame(()=>{
   // Auth/connection forms scroll inside their own shortened container.
   const field=document.activeElement;
   if(field instanceof HTMLElement&&field.closest('.auth-screen'))field.scrollIntoView({block:'nearest',behavior:'instant'});
  });
  clearTimeout(timer);timer=setTimeout(()=>{delete root.dataset.viewportResizing;window.dispatchEvent(new Event('mobile-viewport-settled'))},450);
 };
 layout();window.addEventListener('resize',layout);
 await Keyboard.addListener('keyboardWillShow',info=>keyboard(info.keyboardHeight));
 await Keyboard.addListener('keyboardWillHide',()=>keyboard(0));
 await App.addListener('appStateChange',({isActive})=>{
  if(isActive){void refreshNativePermission();window.dispatchEvent(new Event('online'))}
  else void flushNativeStorage();
 });
 await LocalNotifications.addListener('localNotificationActionPerformed',event=>{
  window.dispatchEvent(new CustomEvent('native-notification-open',{detail:event.notification.extra}));
 });
 // Existing actions call triggerHaptic; its throttle also deduplicates this
 // fallback for ordinary controls. Do not vibrate for every streamed token.
 document.addEventListener('click',event=>{
  const target=(event.target as Element)?.closest?.('button,[role=switch],[role=tab],[role=menuitem],input[type=checkbox]');
  if(target&&!target.matches(':disabled,[aria-disabled=true]'))void import('../haptics').then(({triggerHaptic})=>triggerHaptic('selection'));
 });
 const dialogs=new WeakSet<Element>();
 new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes){
   if(!(node instanceof Element))continue;
   const dialog=node.matches('[role=dialog]')?node:node.querySelector('[role=dialog]');
   if(dialog&&!dialogs.has(dialog)){dialogs.add(dialog);void import('../haptics').then(({triggerHaptic})=>triggerHaptic('light'))}
  }
 }).observe(document.body,{childList:true,subtree:true});
}
export function hideNativeSplash(){if(isNativeIOS())void SplashScreen.hide({fadeOutDuration:160}).catch(()=>{})}
