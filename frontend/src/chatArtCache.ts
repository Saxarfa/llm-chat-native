type Asset={url:string;size:number};
type Entry={asset?:Asset;promise:Promise<Asset>;users:number};

// Keep decoded art across chat mounts. Evict only images no mounted viewer uses.
export function createChatArtCache(limit=64*1024*1024,maxEntries=32){
 const entries=new Map<string,Entry>();
 const touch=(key:string,entry:Entry)=>{entries.delete(key);entries.set(key,entry)};
 const trim=()=>{
  let bytes=[...entries.values()].reduce((total,entry)=>total+(entry.asset?.size||0),0);
  for(const [key,entry] of entries){
   if(entries.size<=maxEntries&&bytes<=limit)break;
   if(entry.users||!entry.asset)continue;
   entries.delete(key);bytes-=entry.asset.size;URL.revokeObjectURL(entry.asset.url);
  }
 };
 return {
  peek(key:string){return entries.get(key)?.asset?.url||''},
  retain(key:string,load:()=>Promise<Asset>){
   let entry=entries.get(key);
   if(!entry){
    const created:Entry={users:0,promise:Promise.resolve().then(load)};
    entry=created;entries.set(key,created);
    created.promise=created.promise.then(asset=>{created.asset=asset;trim();return asset},error=>{if(entries.get(key)===created)entries.delete(key);throw error});
   }
   entry.users++;touch(key,entry);let released=false;
   return {promise:entry.promise.then(asset=>asset.url),release(){if(released)return;released=true;entry.users--;trim()}};
  }
 };
}
export const chatArtCache=createChatArtCache();
