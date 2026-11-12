import {Preferences} from '@capacitor/preferences';

export const isAppKey=(key:string)=>/^(llm[-_]|llamachat_|saxara[_-])/.test(key);
// Conversations already live in SQLite on the PC. Preferences is for small
// device state; attachment bytes have their own native Documents directory.
export const isPersistentKey=(key:string)=>isAppKey(key)&&!key.endsWith('llamachat_conversations');
type PreferencesStore=Pick<typeof Preferences,'get'|'set'|'remove'|'keys'>;
let pending:Promise<unknown>=Promise.resolve();
export const flushNativeStorage=()=>pending;

export async function mirrorNativeStorage(scope:string,preferences:PreferencesStore=Preferences){
 const prefix='llmchat:'+encodeURIComponent(scope)+':';
 const original={set:Storage.prototype.setItem,remove:Storage.prototype.removeItem,clear:Storage.prototype.clear};
 const areas=[['local',localStorage],['session',sessionStorage]] as const;
 const {keys}=await preferences.keys();
 const initialized=(await preferences.get({key:prefix+'ready'})).value==='1';
 for(const [name,area] of areas){
  const areaPrefix=prefix+name+':';
  if(initialized){
   // Native storage is authoritative, including deletions/logout.
   for(const key of Object.keys(area))if(isAppKey(key))original.remove.call(area,key);
   for(const key of keys.filter(k=>k.startsWith(areaPrefix))){
    const value=(await preferences.get({key})).value;
    if(value!==null)original.set.call(area,decodeURIComponent(key.slice(areaPrefix.length)),value);
   }
  }else{
   for(const key of Object.keys(area))if(isPersistentKey(key))await preferences.set({key:areaPrefix+encodeURIComponent(key),value:area.getItem(key)!});
  }
 }
 await preferences.set({key:prefix+'ready',value:'1'});
 const enqueue=(work:()=>Promise<unknown>)=>{
  pending=pending.catch(()=>{}).then(work).catch(()=>{
   // Do not expose stored values or silently imply a durable save.
   window.dispatchEvent(new CustomEvent('native-storage-error'));
  });
 };
 const nativeKey=(area:Storage,key:string)=>prefix+(area===localStorage?'local':'session')+':'+encodeURIComponent(key);
 const managed=(area:Storage)=>area===localStorage||area===sessionStorage;
 Storage.prototype.setItem=function(key,value){
  original.set.call(this,key,value);
  if(managed(this)&&isPersistentKey(String(key)))enqueue(()=>preferences.set({key:nativeKey(this,String(key)),value:String(value)}));
 };
 Storage.prototype.removeItem=function(key){
  original.remove.call(this,key);
  if(managed(this)&&isPersistentKey(String(key)))enqueue(()=>preferences.remove({key:nativeKey(this,String(key))}));
 };
 Storage.prototype.clear=function(){
  const keys=Object.keys(this);original.clear.call(this);
  if(managed(this))for(const key of keys.filter(isPersistentKey))enqueue(()=>preferences.remove({key:nativeKey(this,key)}));
 };
 return()=>{Storage.prototype.setItem=original.set;Storage.prototype.removeItem=original.remove;Storage.prototype.clear=original.clear};
}
