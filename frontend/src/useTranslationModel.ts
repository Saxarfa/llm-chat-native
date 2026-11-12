import {accountKey} from './accountStorage';
import {useEffect,useState} from 'react';
import {activeModel,api,useChatLayout} from './store';
import {modelName} from './domain';

// A separate preference: installing the translator must not change the chat model.
const preference='llm.translationModel.v2';
const preferenceEvent='llm-translation-model-change';
const legacyLocalTranslator='gemma-4-e2b-translation';
type LocalModel={id:string;name:string};
export function useTranslationModel(){
 const state=useChatLayout();
 const [local,setLocal]=useState<LocalModel[]>([]),[model,setModel]=useState(()=>{try{return localStorage.getItem(accountKey(preference))||''}catch{return ''}});
 useEffect(()=>{
  let alive=true;
  void api('/api/translation/models').then(data=>{
   if(!alive)return;
   setLocal(data.models||[]);
   setModel(current=>{
    const migrated=current===legacyLocalTranslator&&data.default_model?data.default_model:current;
    if(migrated!==current){try{localStorage.setItem(accountKey(preference),migrated)}catch{}}
    return migrated||data.default_model||activeModel();
   });
  }).catch(()=>{if(alive)setModel(current=>current||activeModel())});
  const sync=()=>{try{const value=localStorage.getItem(accountKey(preference));if(value)setModel(value)}catch{}};
  window.addEventListener(preferenceEvent,sync);
  window.addEventListener('storage',sync);
  return()=>{alive=false;window.removeEventListener(preferenceEvent,sync);window.removeEventListener('storage',sync)};
 },[]);
 const models=[...new Set([...local.map(item=>item.id),model,activeModel(),state.settings.model,...state.models.map(item=>item.id)])].filter(id=>id&&id!=='local-model');
 const chooseModel=(id:string)=>{setModel(id);try{localStorage.setItem(accountKey(preference),id);window.dispatchEvent(new Event(preferenceEvent))}catch{}};
 const name=(id:string)=>local.find(item=>item.id===id)?.name||modelName(id,state.settings);
 return {model,models,chooseModel,name};
}
