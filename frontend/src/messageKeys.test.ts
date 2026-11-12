import {it,expect} from 'vitest';
import {assistantMessageKey,conversationMessageKeys} from './messageKeys';
it('keeps live and completed first replies mounted under the same key',()=>{
 const question={id:'u',role:'user'};
 expect(assistantMessageKey([question,{id:'live',role:'assistant'}],1)).toBe(assistantMessageKey([question,{id:'saved',role:'assistant'}],1));
});
it('keeps adjacent answers distinct after their intervening question is deleted',()=>{
 const messages=[{id:'u',role:'user'},{id:'a1',role:'assistant'},{id:'a2',role:'assistant'}];
 expect(assistantMessageKey(messages,1)).not.toBe(assistantMessageKey(messages,2));
});
it('keeps orphan and legacy replies distinct',()=>{
 const messages=[{role:'assistant'},{role:'assistant'}];
 expect(assistantMessageKey(messages,0)).not.toBe(assistantMessageKey(messages,1));
});
it('keeps stable distinct keys in long histories with system rows and deleted questions',()=>{
 const messages=[{role:'assistant'},{role:'system'},{role:'user'},{role:'system'},{id:'a',role:'assistant'},{id:'b',role:'assistant'},...Array.from({length:1000},(_,i)=>({id:String(i),role:i%2?'assistant':'user'}))];
 const keys=conversationMessageKeys(messages);
 messages.forEach((message,index)=>{if(message.role==='assistant')expect(keys[index]).toBe(assistantMessageKey(messages,index))});
 expect(new Set(keys).size).toBe(keys.length);
 expect(keys[4]).toBe('reply-msg-2');
});
