import {accountKey} from './accountStorage';
import {useSyncExternalStore} from 'react';

export type InterfaceSize='compact'|'normal'|'large';
export const INTERFACE_SIZE_KEY='llm_interface_size';
export function validInterfaceSize(value:unknown):InterfaceSize{
 return value==='compact'||value==='large'?value:'normal';
}

let size:InterfaceSize='normal',initialized=false;
const listeners=new Set<()=>void>();
function readSize(){
 try{return validInterfaceSize(localStorage.getItem(accountKey(INTERFACE_SIZE_KEY)))}catch{return 'normal' as const}
}
function apply(){document.documentElement.dataset.uiSize=size}
export function initializeInterfaceSize(){
 if(initialized)return;
 window.addEventListener('account-changed',()=>{size=readSize();apply();listeners.forEach(listener=>listener())});
 initialized=true;size=readSize();apply();
 window.addEventListener('storage',event=>{
  if(event.key!==accountKey(INTERFACE_SIZE_KEY)&&event.key!==null)return;
  size=readSize();apply();listeners.forEach(listener=>listener());
 });
}
export function setInterfaceSize(value:InterfaceSize){
 initializeInterfaceSize();size=validInterfaceSize(value);
 try{localStorage.setItem(accountKey(INTERFACE_SIZE_KEY),size)}catch{/* Keep the preference for this page when storage is unavailable. */}
 apply();listeners.forEach(listener=>listener());
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
export function useInterfaceSize(){return useSyncExternalStore(subscribe,()=>size,()=> 'normal' as InterfaceSize)}
