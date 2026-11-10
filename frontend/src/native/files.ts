import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {nativeServer} from './network';
import type {Attachment} from '../types';

async function fileKey(key:string){
 const bytes=new TextEncoder().encode(nativeServer()+'\n'+key);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return 'llm-drafts/'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+'.json';
}
export const nativeDraftFiles={
 async put(key:string,items:Attachment[]){
  await Filesystem.writeFile({path:await fileKey(key),data:JSON.stringify(items),directory:Directory.Data,encoding:Encoding.UTF8,recursive:true});
 },
 async get(key:string):Promise<Attachment[]|undefined>{
  try{const result=await Filesystem.readFile({path:await fileKey(key),directory:Directory.Data,encoding:Encoding.UTF8});return JSON.parse(String(result.data))}
  catch(error){if((error as {code?:string}).code==='OS-PLUG-FILE-0008')return undefined;throw error}
 },
 async remove(key:string){
  const path=await fileKey(key);
  try{await Filesystem.deleteFile({path,directory:Directory.Data})}catch(error){if((error as {code?:string}).code!=='OS-PLUG-FILE-0008')throw error}
 },
};
const base64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(blob)});
export async function nativeShare(data:ShareData){
 const paths:string[]=[];
 try{
  for(const file of data.files||[]){
   const name=file.name.replace(/[^\p{L}\p{N}._-]/gu,'_')||'LLM-Chat';
   const path='llm-share/'+crypto.randomUUID()+'/'+name;
   const result=await Filesystem.writeFile({path,data:await base64(file),directory:Directory.Cache,recursive:true});
   paths.push(result.uri);
  }
  await Share.share({title:data.title,text:data.text,url:data.url,files:paths.length?paths:undefined,dialogTitle:'Поделиться'});
 }finally{
  for(const path of paths)await Filesystem.deleteFile({path}).catch(()=>{});
 }
}
export function installNativeSharing(){
 Object.defineProperty(navigator,'share',{configurable:true,value:nativeShare});
 Object.defineProperty(navigator,'canShare',{configurable:true,value:(data:ShareData)=>!!(data.files?.length||data.text||data.url)});
 const save=async(anchor:HTMLAnchorElement)=>{
  try{
   const response=await fetch(anchor.href);if(!response.ok)throw Error();
   await nativeShare({files:[new File([await response.blob()],anchor.download||'LLM-Chat',{type:response.headers.get('Content-Type')||'application/octet-stream'})]});
  }catch(error){
   // Cancellation is a normal share-sheet outcome.
   if(!/cancel/i.test(String((error as Error)?.message||'')))window.dispatchEvent(new Event('native-share-error'));
  }
 };
 const original=HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click=function(){if(this.hasAttribute('download'))void save(this);else original.call(this)};
 document.addEventListener('click',event=>{
  const anchor=(event.target as Element)?.closest?.('a[download]');
  if(!(anchor instanceof HTMLAnchorElement))return;
  event.preventDefault();event.stopImmediatePropagation();void save(anchor);
 },true);
}
