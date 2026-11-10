import {expect,it} from 'vitest';
import {chatLayoutEqual} from './chatLayout';
import type {State} from './types';
const before={user:{id:1},active:'chat',settings:{},chats:[],lives:{chat:{chat_id:'chat',model:'m',text:'a',reasoning:'b',is_thinking:true,phase:'Думаю…'}}} as unknown as State;
it('isolates appended text, counters and SSE envelope metadata from the shell',()=>{
 const after={...before,lives:{chat:{...before.lives.chat,text:'answer',reasoning:'thought',contextUsed:2000,id:'event-2',timestamp:42}}};
 expect(chatLayoutEqual(before,after)).toBe(true);
});
it('propagates account, history, lifecycle, stop, model and tool changes immediately',()=>{
 for(const patch of [{user:{id:2}},{active:'other'},{chats:[]},{lives:{}},{settings:{temperature:1}}])expect(chatLayoutEqual(before,{...before,...patch} as State)).toBe(false);
 for(const patch of [{is_thinking:false},{stopping:true},{restored:true},{model:'other'},{phase:'Поиск'},{target_message_id:'reply'},{tool_events:[]},{sources:[]},{generated_images:[]}])expect(chatLayoutEqual(before,{...before,lives:{chat:{...before.lives.chat,...patch}}})).toBe(false);
});
