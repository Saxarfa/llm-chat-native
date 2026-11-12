import {inferencePayload} from './store';

export type Language='ru'|'en';
export async function translateText(text:string,source:Language,target:Language,mode:'text'|'prompt',signal:AbortSignal,model?:string){
 const inference=inferencePayload();
 const response=await fetch('/api/translate',{
  method:'POST',headers:{...window.storageManager.getAuthHeaders(),'Content-Type':'application/json'},
  body:JSON.stringify({text,source,target,mode,model:model||inference.model,settings:{endpoint:inference.settings.endpoint,apiKey:inference.settings.apiKey}}),
  signal:AbortSignal.any([signal,AbortSignal.timeout(185000)]),
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Не удалось перевести текст');
 if(typeof result.text!=='string'||!result.text.trim())throw new Error('Модель вернула пустой перевод');
 return result.text as string;
}
