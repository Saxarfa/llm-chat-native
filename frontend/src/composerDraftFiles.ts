import type {Attachment} from './types';
import {isNativeIOS} from './native/platform';
import {nativeDraftFiles} from './native/files';

// Keep large files out of synchronous sessionStorage and out of typing writes.
let database:Promise<IDBDatabase>|undefined;
function open(){
 return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('llm-composer-files',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('files');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error)};
 });
}
async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>){
 const db=await open();return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction('files',mode),request=action(tx.objectStore('files'));
  tx.oncomplete=()=>resolve(request.result);tx.onabort=tx.onerror=()=>reject(tx.error||request.error);
 });
}
export const composerDraftFiles={
 put:async(key:string,items:Attachment[])=>{if(isNativeIOS()){await nativeDraftFiles.put(key,items);return key}return transaction('readwrite',store=>store.put(items,key))},
 get:(key:string)=>isNativeIOS()?nativeDraftFiles.get(key):transaction<Attachment[]|undefined>('readonly',store=>store.get(key)),
 remove:async(key:string)=>{if(isNativeIOS()){await nativeDraftFiles.remove(key);return}await transaction('readwrite',store=>store.delete(key))},
};
export type DraftFiles=typeof composerDraftFiles;
