import type {Live,State} from './types';
const layoutFields:readonly (keyof Live)[]=['chat_id','trace_id','contextSize','contextEstimated','user_message','model','phase','is_thinking','tool_events','generated_images','web_images','sources','target_message_id','stopping','restored'];
// Text/counters belong to the live message and context meter. Updating them
// must not commit the entire shell and its layout-animation projection tree.
export function chatLayoutEqual(before:State,after:State){
 if(before===after)return true;
 const keys=Object.keys(after) as (keyof State)[];
 if(keys.length!==Object.keys(before).length||keys.some(key=>key!=='lives'&&!Object.is(before[key],after[key])))return false;
 const ids=Object.keys(after.lives);
 if(ids.length!==Object.keys(before.lives).length)return false;
 return ids.every(id=>{
  const a=before.lives[id],b=after.lives[id];
  return a===b||!!a&&!!b&&layoutFields.every(key=>Object.is(a[key],b[key]));
 });
}
