import type {Message} from './types';

export type ReadingPosition={anchorId:string;beforeId?:string;afterId?:string;index:number;offset:number;atBottom:boolean;at:number};
type Entry={chatId:string;branchId:string;position:ReadingPosition;temporary?:boolean};
const keyOf=(chatId:string,branchId:string)=>JSON.stringify([chatId,branchId]);
const valid=(value:unknown):value is Entry=>{
 const row=value as Entry,p=row?.position;
 return !!row&&typeof row.chatId==='string'&&typeof row.branchId==='string'&&!!p&&typeof p.anchorId==='string'&&
  [p.index,p.offset,p.at].every(Number.isFinite)&&p.index>=0&&Math.abs(p.offset)<=1e6&&typeof p.atBottom==='boolean'&&
  (p.beforeId===undefined||typeof p.beforeId==='string')&&(p.afterId===undefined||typeof p.afterId==='string');
};

/** Small per-tab account bookmarks, never message content or entire DOM trees. */
export function createReadingPositions(storage:()=>Pick<Storage,'getItem'|'setItem'>,key:string,limit=100){
 const entries=new Map<string,Entry>();let loaded=false;
 const trim=()=>{while(entries.size>limit){const oldest=[...entries].sort((a,b)=>a[1].position.at-b[1].position.at)[0];if(oldest)entries.delete(oldest[0]);else break}};
 const read=()=>{if(loaded)return;loaded=true;try{const data=JSON.parse(storage().getItem(key)||'null');if(data?.version===1&&Array.isArray(data.entries))for(const row of data.entries)if(valid(row)&&!row.temporary)entries.set(keyOf(row.chatId,row.branchId),row);trim()}catch{/* A private/storage-disabled tab still has in-memory bookmarks. */}};
 const persist=()=>{try{storage().setItem(key,JSON.stringify({version:1,entries:[...entries.values()].filter(row=>!row.temporary)}))}catch{/* Keep the reading position in memory. */}};
 return {
  get(chatId:string,branchId='main'){read();return entries.get(keyOf(chatId,branchId))?.position},
  save(chatId:string,branchId:string,position:ReadingPosition,temporary=false){read();entries.set(keyOf(chatId,branchId),{chatId,branchId,position,temporary});trim();persist()},
  clearMemory(){entries.clear();loaded=false},
 };
}

export function resolveReadingAnchor(position:ReadingPosition|undefined,messages:readonly Message[]){
 if(!position||position.atBottom)return undefined;
 for(const id of [position.anchorId,position.afterId,position.beforeId])if(id&&messages.some(message=>message.id===id))return id;
 return messages[Math.min(Math.floor(position.index),messages.length-1)]?.id;
}

export function captureReadingPosition(area:HTMLElement,messages:readonly Message[],atBottom?:boolean):ReadingPosition|undefined{
 const viewport=area.getBoundingClientRect();
 const rows=Array.from(area.querySelectorAll<HTMLElement>('.message[data-message-id]'));
 const seen=rows.filter(node=>{const rect=node.getBoundingClientRect();return rect.bottom>viewport.top&&rect.top<viewport.bottom});
 const known=new Set(messages.map(message=>message.id));
 const row=seen.find(node=>known.has(node.dataset.messageId||''));
 if(!row){
  // The streaming reply is rendered outside `messages`. A bookmark on it would
  // resolve to index 0 and later throw the reader to the top of the chat.
  const last=messages[messages.length-1];
  return seen.length&&last?{anchorId:last.id,index:messages.length-1,beforeId:messages[messages.length-2]?.id,offset:0,atBottom:true,at:Date.now()}:undefined;
 }
 const anchorId=row.dataset.messageId||'',index=messages.findIndex(message=>message.id===anchorId);
 return {anchorId,index,beforeId:messages[index-1]?.id,afterId:messages[index+1]?.id,offset:row.getBoundingClientRect().top-viewport.top,
  atBottom:atBottom??area.scrollHeight-area.clientHeight-area.scrollTop<48,at:Date.now()};
}

export function restoreReadingPosition(area:HTMLElement,position:ReadingPosition|undefined,messages:readonly Message[]){
 const anchorId=resolveReadingAnchor(position,messages);
 const node=anchorId?Array.from(area.querySelectorAll<HTMLElement>('.message[data-message-id]')).find(row=>row.dataset.messageId===anchorId):undefined;
 if(!node||!position){area.scrollTop=area.scrollHeight;return true}
 const same=node.dataset.messageId===position.anchorId;
 area.scrollTop+=node.getBoundingClientRect().top-area.getBoundingClientRect().top-(same?position.offset:0);
 return false;
}
