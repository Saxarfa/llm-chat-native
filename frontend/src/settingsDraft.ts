import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {accountKey} from './accountStorage';

const ttl=24*60*60*1000;
export function readSettingsDraft<T>(key:string,initial:T,source:unknown=initial):T{
 try{const saved=JSON.parse(sessionStorage.getItem(accountKey('settings-draft:'+key))||'null');
  if(saved?.version===1&&Date.now()-saved.at<ttl&&saved.base===JSON.stringify(source))return saved.value as T;
 }catch{/* Storage may be unavailable. Keep editing in memory. */}return initial;
}
export function useSettingsDraft<T>(key:string,initial:T,select:(value:T)=>T=(value)=>value,source:unknown=initial):[T,Dispatch<SetStateAction<T>>,()=>void]{
 const baseline=useRef(source),clean=useRef(initial),storageKey=accountKey('settings-draft:'+key),[value,setValue]=useState<T>(()=>readSettingsDraft(key,initial,source));
 const latest=useRef(value);latest.current=value;
 const selector=useRef(select);selector.current=select;
 const clear=()=>{baseline.current=latest.current;clean.current=latest.current;try{sessionStorage.removeItem(storageKey)}catch{}};
 useEffect(()=>{const persist=()=>{try{const safe=selector.current(latest.current);if(JSON.stringify(safe)===JSON.stringify(clean.current))sessionStorage.removeItem(storageKey);else sessionStorage.setItem(storageKey,JSON.stringify({version:1,at:Date.now(),base:JSON.stringify(baseline.current),value:safe}))}catch{}};
  persist();window.addEventListener('pagehide',persist);return()=>{persist();window.removeEventListener('pagehide',persist)};
 },[value,storageKey]);
 return [value,setValue,clear];
}

// Explicit allow-list: API keys, URLs, imports and other connection secrets never reach storage.
export function publicSettingsDraft(values:Record<string,unknown>){return Object.fromEntries(Object.entries(values).filter(([key])=>['fontSize','autoScroll','autoTitle','chatSuggestions','searchProvider','searchMode','searchMaxResults'].includes(key)))}

export function settingsFieldError(key:string,value:unknown){
 if(key==='accountName')return String(value||'').trim()?'':'Укажите отображаемое имя.';
 if(key==='endpoint'||key==='searxngUrl'){
  if(!String(value||'').trim())return '';
  try{const url=new URL(String(value));if(['http:','https:'].includes(url.protocol)&&url.hostname)return ''}catch{}
  return 'Укажите адрес, начинающийся с http:// или https://.';
 }
 if(key==='searchMaxResults'){const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=10?'':'Укажите целое число от 1 до 10.'}
 return '';
}

// Keep an editor draft when its page is closed; explicit cancel/save clears it.
export function useSettingsEditor<T>(key:string,identity:(value:T)=>string){
 const [cached,setCached]=useSettingsDraft<T|null>(key,null),[visible,setVisible]=useState(false);
 const current=useRef<T|null>(cached);current.current=cached;
 const set:Dispatch<SetStateAction<T|null>>=next=>{
  const value=typeof next==='function'?(next as (value:T|null)=>T|null)(current.current):next;
  if(value===null){setCached(null);setVisible(false);return}
  setCached(!visible&&current.current&&identity(current.current)===identity(value)?current.current:value);setVisible(true);
 };
 return [visible?cached:null,set,()=>setVisible(false)] as const;
}
