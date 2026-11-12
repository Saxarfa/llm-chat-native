import {useEffect,useRef} from 'react';
import {isNativeIOS} from './platform';
export type NativeRoute={page:'chat'|'images'|'workspace';chatId:string;settings:string|null;profile:string|null;parameters:boolean};
export function useNativeNavigation(route:NativeRoute,ready:boolean,navigate:(route:NativeRoute)=>Promise<void>){
 const callback=useRef(navigate);callback.current=navigate;
 const previous=useRef(''),restoring=useRef(false),started=useRef(false);
 const serialized=JSON.stringify(route);
 useEffect(()=>{
  if(!isNativeIOS()||!ready||restoring.current||previous.current===serialized)return;
  previous.current=serialized;
  const previousIndex=Number(window.history.state?.llmIndex)||0;
  const state={llmRoute:JSON.parse(serialized),llmIndex:started.current?previousIndex+1:0};
  if(started.current)history.pushState(state,'');else{history.replaceState(state,'');started.current=true}
  document.documentElement.dataset.nativeCanBack=String(state.llmIndex>0);
 },[serialized,ready]);
 useEffect(()=>{
  if(!isNativeIOS())return;
  const back=(event:PopStateEvent)=>{
   const target=event.state?.llmRoute as NativeRoute|undefined;if(!target)return;
   document.documentElement.dataset.nativeCanBack=String(event.state.llmIndex>0);
   restoring.current=true;previous.current=JSON.stringify(target);
   void callback.current(target).finally(()=>{restoring.current=false});
  };
  window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);
 },[]);
}
