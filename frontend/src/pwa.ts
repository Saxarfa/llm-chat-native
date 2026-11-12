import {isNativeIOS} from './native/platform';
import {nativePermission,requestNativeNotifications,nativeNotification} from './native/runtime';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let prompt:InstallPrompt|undefined,registration:ServiceWorkerRegistration|undefined;
const NOTIFICATION_PREF_KEY='llm_pwa_notifications';
const listeners=new Set<()=>void>();
const changed=()=>listeners.forEach(listener=>listener());
export const subscribePWA=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export const canInstallPWA=()=>!!prompt;
export const hasPWAUpdate=()=>!!registration?.waiting;
export function isStandalone(){return isNativeIOS()||typeof window!=='undefined'&&(matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone)}
export function supportsPWANotifications(){return isNativeIOS()||typeof window!=='undefined'&&'Notification' in window}
export function getPWANotificationPermission():NotificationPermission|'unsupported'{
 return isNativeIOS()?nativePermission:supportsPWANotifications()?Notification.permission:'unsupported';
}
export function arePWANotificationsEnabled(){
 if(getPWANotificationPermission()!=='granted')return false;
 try{return localStorage.getItem(NOTIFICATION_PREF_KEY)==='true'}catch{return false}
}
export async function setPWANotificationsEnabled(enabled:boolean):Promise<boolean>{
 if(!supportsPWANotifications())return false;
 if(isNativeIOS()){
  const allowed=enabled?await requestNativeNotifications():false;
  localStorage.setItem(NOTIFICATION_PREF_KEY,String(allowed));changed();return allowed;
 }
 if(!enabled){
  try{localStorage.setItem(NOTIFICATION_PREF_KEY,'false')}catch{}
  changed();
  return false;
 }
 if(Notification.permission==='default'){
  try{
   const result=await Notification.requestPermission();
   if(result!=='granted'){changed();return false}
  }catch{changed();return false}
 }else if(Notification.permission!=='granted'){
  changed();
  return false;
 }
 try{localStorage.setItem(NOTIFICATION_PREF_KEY,'true')}catch{}
 changed();
 return true;
}
export function notifyWhenHidden(title:string,body:string,tag='llm-chat',data:Record<string,unknown>={}){
 if(typeof document==='undefined'||document.visibilityState!=='hidden'||!arePWANotificationsEnabled())return;
 try{
  if(isNativeIOS()){void nativeNotification(title,body,tag,data).catch(()=>{});return}
  if(registration?.showNotification){
   void registration.showNotification(title,{body,tag,icon:'/icon-192.png',badge:'/icon-192.png',data}).catch(()=>{});
   return;
  }
  if(navigator.serviceWorker?.controller){
   navigator.serviceWorker.controller.postMessage({type:'SHOW_NOTIFICATION',title,body,tag,data});
   return;
  }
  new Notification(title,{body,tag,icon:'/icon-192.png',data});
 }catch{}
}
export async function installPWA(){const offer=prompt;if(!offer)return;prompt=undefined;changed();try{await offer.prompt();await offer.userChoice}finally{changed()}}
export function updatePWA(){
 const waiting=registration?.waiting;if(!waiting)return;
 // Reload only after an explicit action. pagehide flushes the existing draft writer.
 navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
 waiting.postMessage({type:'ACTIVATE_UPDATE'});
}
export function initializePWA(){
 if(isNativeIOS()){window.addEventListener('native-notification-permission',changed);return}
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event as InstallPrompt;changed()});
 window.addEventListener('appinstalled',()=>{prompt=undefined;changed()});
 if(import.meta.env.DEV||!window.isSecureContext||!('serviceWorker' in navigator))return;
 let lastCheck=0;
 const check=()=>{if(registration&&document.visibilityState==='visible'&&navigator.onLine&&Date.now()-lastCheck>3600000){lastCheck=Date.now();void registration.update().catch(()=>{})}};
 const register=()=>{void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(value=>{
  registration=value;lastCheck=Date.now();changed();
  value.addEventListener('updatefound',()=>{const installing=value.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed')changed()})});
  document.addEventListener('visibilitychange',check);window.addEventListener('online',check);
 }).catch(()=>{/* The ordinary website remains usable when installation is unavailable. */})};
 if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
}
