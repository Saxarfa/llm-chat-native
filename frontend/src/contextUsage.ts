import type {Message,Live} from './types';
import {answerUsage} from './answerUsage';
const positive=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
// Historical answer metrics describe that request's window, not today's
// worker configuration. Live requests retain their own actual window.
export function contextCapacity({live,runtime,measured,configured,historical}:{live?:number;runtime?:number;measured?:number;configured?:number;historical?:number}){
 return positive(live)??positive(runtime)??positive(measured)??positive(configured)??positive(historical);
}
export function contextUsage(messages:Message[],model:string,systemPrompt:string,live?:Live){
 const target=live?.target_message_id?messages.findIndex(message=>message.id===live.target_message_id):-1;
 if(target>=0)messages=messages.slice(0,target);
 let anchor=-1;
 for(let i=messages.length-1;i>=0;i--)if(messages[i].role==='assistant'&&messages[i].model===model&&positive(messages[i].metrics?.promptTokens)){anchor=i;break}
 const metrics=anchor>=0?answerUsage(messages[anchor]):undefined;
 const estimate=(text:string)=>Math.ceil(text.length/3);
 let used=anchor>=0?Math.round(metrics!.promptTokens!+(metrics!.lastCompletionTokens??Math.max(0,(metrics!.tokens||0)-(metrics!.previousToolTokens||0)))):estimate(systemPrompt)+4;
 const rest=messages.slice(anchor+1);
 for(const message of rest)used+=estimate(message.content)+4;
 if(live)used+=estimate((live.reasoning||'')+(live.text||''));
 if(live?.contextUsed!=null)return {used:live.contextUsed,capacity:positive(live.contextSize),estimated:live.contextEstimated!==false};
 return {used,capacity:positive(metrics?.contextSize),estimated:anchor<0||rest.length>0||!!live||metrics?.estimated!==false};
}
