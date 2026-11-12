export type SentOrigin='composer'|'suggestion';
const entries=new Map<string,{at:number;origin:SentOrigin}>();

// Keep presentation state out of saved conversations. History and restored
// branches must not replay the animation of an old send.
export function markMessageSent(id:string,origin:SentOrigin='composer'){
 const now=Date.now();
 for(const [key,entry] of entries)if(now-entry.at>1500)entries.delete(key);
 entries.set(id,{at:now,origin});
}
export function sentMessageMotion(id:string){
 const entry=entries.get(id);
 return entry&&Date.now()-entry.at<1500?entry.origin:null;
}
export function finishMessageMotion(id:string){entries.delete(id)}
