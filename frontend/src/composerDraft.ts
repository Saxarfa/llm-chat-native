import type {Attachment} from './types';
import {randomId} from './randomId';
import type {DraftFiles} from './composerDraftFiles';

export type ComposerDraft={text:string;attachments:Attachment[];pastedTexts:string[]};
type DraftStorage=Pick<Storage,'setItem'|'removeItem'>;

/** Save small draft metadata between typing bursts; file bytes change separately. */
export function createDraftWriter(key:string,storage:()=>DraftStorage,delay=180,files?:DraftFiles){
 let pending:ComposerDraft|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 let fileKey:string|undefined,savedAttachments:Attachment[]|undefined,revision=0,loading=false;
 let committedFileKey:string|undefined;
 let writes=Promise.resolve();
 let deadline:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{clearTimeout(timer);clearTimeout(deadline);timer=deadline=undefined};
 const flush=()=>{
  cancel();if(!pending)return writes;
  const value=pending,owner=revision;
  if(files&&loading){
   const current=fileKey;
   writes=writes.catch(()=>{}).then(()=>{storage().setItem(key,JSON.stringify({...value,attachments:[],fileKey:current}))})
    .catch(()=>{if(owner===revision)pending??=value});pending=undefined;
  }else if(files&&value.attachments.length){
   const previous=fileKey;
   if(savedAttachments!==value.attachments){
    fileKey=key+':'+randomId();savedAttachments=value.attachments;
    const next=fileKey;
    writes=writes.catch(()=>{}).then(async()=>{
     await files.put(next,value.attachments);
     committedFileKey=next;
     // Publish the reference only after its bytes have been committed.
     storage().setItem(key,JSON.stringify({...value,attachments:[],fileKey:next}));
     if(previous)await files.remove(previous);
    });
   }else{
    const current=fileKey;
    writes=writes.catch(()=>{}).then(async()=>{
     // A newer text save may already be queued when the initial file write fails.
     // Never publish a reference whose bytes have not committed successfully.
     if(committedFileKey!==current){await files.put(current!,value.attachments);committedFileKey=current}
     storage().setItem(key,JSON.stringify({...value,attachments:[],fileKey:current}));
    });
   }
   writes=writes.catch(()=>{if(owner===revision){savedAttachments=undefined;pending??=value}});pending=undefined;
  }else if(files){
   const previous=fileKey;fileKey=undefined;savedAttachments=undefined;
   writes=writes.catch(()=>{}).then(async()=>{
    storage().setItem(key,JSON.stringify(value));if(previous)await files.remove(previous);
   }).catch(()=>{if(owner===revision)pending??=value});pending=undefined;
  }else{
   try{storage().setItem(key,JSON.stringify(value));pending=undefined}catch{/* Keep the in-memory draft and retry on the next flush. */}
  }
  return writes;
 };
 return {
  update(draft:ComposerDraft){revision++;pending=draft;clearTimeout(timer);timer=setTimeout(flush,delay);deadline??=setTimeout(flush,1000)},
  flush,
  restoring(id:string){fileKey=id;loading=true},
  restored(id:string,attachments:Attachment[]){fileKey=id;committedFileKey=id;savedAttachments=attachments;loading=false},
  clear(){revision++;cancel();pending=undefined;savedAttachments=undefined;loading=false;const previous=fileKey;fileKey=undefined;
   // Serialize clearing after in-flight writes so they cannot resurrect a sent draft.
   if(files)writes=writes.catch(()=>{}).then(async()=>{storage().removeItem(key);if(previous)await files.remove(previous)}).catch(()=>{});
   try{storage().removeItem(key)}catch{/* A storage failure must not undo an accepted send. */}
   return writes;
  },
 };
}
