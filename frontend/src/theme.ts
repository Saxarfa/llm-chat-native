import {accountKey} from './accountStorage';
import {useSyncExternalStore} from 'react';
import {syncNativeTheme} from './haptics';

export type ThemeMode='dark'|'oled'|'light'|'system';
export type ResolvedTheme='dark'|'oled'|'light';
export const THEME_STORAGE_KEY='saxara_chat_theme';
export function validThemeMode(value:unknown):ThemeMode{return value==='light'||value==='oled'||value==='system'?value:'dark'}
export function resolveTheme(mode:ThemeMode,systemDark:boolean):ResolvedTheme{return mode==='system'?(systemDark?'dark':'light'):mode}

let mode:ThemeMode='dark';
let initialized=false;
let system:MediaQueryList|undefined;
let transitionTimer:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();

function readMode():ThemeMode{
 try{return validThemeMode(localStorage.getItem(accountKey(THEME_STORAGE_KEY)))}catch{return 'dark'}
}
function apply(animate=false){
 const root=document.documentElement,resolved=resolveTheme(mode,system?.matches??false);
 if(animate&&root.dataset.theme!==resolved){
  clearTimeout(transitionTimer);
  root.dataset.themeChanging='true';
  transitionTimer=setTimeout(()=>{delete root.dataset.themeChanging},240);
 }
 root.dataset.theme=resolved;
 root.style.colorScheme=resolved==='light'?'light':'dark';
 document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content',resolved==='oled'?'#000000':resolved==='dark'?'#151515':'#f7f5f0');
 document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content',resolved==='light'?'default':'black');
 syncNativeTheme(resolved);
}
export function initializeTheme(){
 if(initialized)return;
 window.addEventListener('account-changed',()=>{mode=readMode();apply();listeners.forEach(listener=>listener())});
 initialized=true;
 mode=readMode();
 if(typeof window.matchMedia==='function'){
  system=window.matchMedia('(prefers-color-scheme: dark)');
  const changed=()=>{if(mode==='system')apply(true)};
  if(system.addEventListener)system.addEventListener('change',changed);
  else system.addListener(changed);
 }
 apply();
 window.addEventListener('storage',event=>{
  if(event.key!==accountKey(THEME_STORAGE_KEY)&&event.key!==null)return;
  mode=readMode();apply(true);listeners.forEach(listener=>listener());
 });
}
export function setThemeMode(value:ThemeMode){
 initializeTheme();
 mode=validThemeMode(value);
 try{localStorage.setItem(accountKey(THEME_STORAGE_KEY),mode)}catch{/* The current page can still switch when storage is unavailable. */}
 apply(true);listeners.forEach(listener=>listener());
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export function useThemeMode(){return useSyncExternalStore(subscribe,()=>mode,()=> 'dark' as ThemeMode)}
