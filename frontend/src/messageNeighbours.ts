import type {Message} from './types';
// Explicit adjacency avoids sibling :has() selectors invalidating the entire
// saved history whenever the live answer inserts or settles a word span.
export function messageNeighbours(messages:readonly Message[],appendedLive=false){
 const result:{nextUser:boolean;last:boolean}[]=new Array(messages.length);
 let next:Message['role']|undefined;
 for(let i=messages.length-1;i>=0;i--){
  result[i]={nextUser:next==='user',last:next===undefined&&!appendedLive};
  if(messages[i].role!=='system')next=messages[i].role;
 }
 return result;
}
