// Account-local, reference-counted media. Only unused blobs count towards LRU.
export type MediaSnapshot={url:string;mime:string;failed:boolean};
type Entry={snapshot:MediaSnapshot;refs:number;bytes:number;used:number;controller?:AbortController;promise?:Promise<void>;listeners:Set<()=>void>};
export const EMPTY_MEDIA:MediaSnapshot={url:'',mime:'',failed:false};
export class NanoMediaCache {
 private entries=new Map<string,Entry>();
 constructor(private limit=64*1024*1024){}
 private key(account:string,path:string){return account+'\n'+path}
 private entry(account:string,path:string){const key=this.key(account,path);let item=this.entries.get(key);if(!item){item={snapshot:EMPTY_MEDIA,refs:0,bytes:0,used:0,listeners:new Set()};this.entries.set(key,item)}return item}
 snapshot=(account:string,path:string)=>this.entry(account,path).snapshot;
 subscribe(account:string,path:string,listener:()=>void){const item=this.entry(account,path);item.listeners.add(listener);return()=>{item.listeners.delete(listener)}}
 retain(account:string,path:string,headers:Record<string,string>){
  const item=this.entry(account,path);item.refs++;item.used=Date.now();
  if(!item.snapshot.url&&!item.snapshot.failed&&!item.promise)this.start(account,path,item,headers);
  let released=false;return()=>{if(released)return;released=true;item.refs=Math.max(0,item.refs-1);item.used=Date.now();queueMicrotask(()=>{if(!item.refs&&item.controller){item.controller.abort();this.drop(this.key(account,path),item)}this.prune()})};
 }
 retry(account:string,path:string,headers:Record<string,string>){const item=this.entry(account,path);if(item.promise)return;item.snapshot=EMPTY_MEDIA;this.emit(item);if(item.refs)this.start(account,path,item,headers)}
 fail(account:string,path:string){const item=this.entry(account,path);if(item.snapshot.url)URL.revokeObjectURL(item.snapshot.url);item.snapshot={url:'',mime:'',failed:true};item.bytes=0;this.emit(item)}
 async load(account:string,path:string,headers:Record<string,string>){const release=this.retain(account,path,headers);const item=this.entry(account,path);if(item.snapshot.failed)this.retry(account,path,headers);try{await item.promise;if(!item.snapshot.url)throw Error('Media unavailable');return {...item.snapshot,release}}catch(error){release();throw error}}
 clear(account:string){for(const [key,item] of this.entries)if(key.startsWith(account+'\n')){this.drop(key,item);this.emit(item)}}
 private emit(item:Entry){for(const listener of item.listeners)listener()}
 private drop(key:string,item:Entry){item.controller?.abort();if(item.snapshot.url)URL.revokeObjectURL(item.snapshot.url);item.snapshot=EMPTY_MEDIA;item.bytes=0;if(this.entries.get(key)===item)this.entries.delete(key)}
 private prune(){const unused=[...this.entries].filter(([,item])=>!item.refs&&!item.controller).sort((a,b)=>a[1].used-b[1].used);let bytes=unused.reduce((sum,[,item])=>sum+item.bytes,0);for(const [key,item] of unused)if(bytes>this.limit||(!item.bytes&&!item.listeners.size)){bytes-=item.bytes;this.drop(key,item)}}
 private start(account:string,path:string,item:Entry,headers:Record<string,string>){
  const controller=new AbortController();item.controller=controller;
  item.promise=(async()=>{try{const response=await fetch(path,{headers,signal:controller.signal});if(!response.ok)throw Error();const blob=await response.blob();if(controller.signal.aborted)return;item.bytes=blob.size;item.snapshot={url:URL.createObjectURL(blob),mime:blob.type,failed:false}}
   catch{if(!controller.signal.aborted)item.snapshot={url:'',mime:'',failed:true}}
   finally{if(item.controller===controller){item.controller=undefined;item.promise=undefined;this.emit(item);this.prune()}}})();
 }
}
export const nanoMediaCache=new NanoMediaCache();
