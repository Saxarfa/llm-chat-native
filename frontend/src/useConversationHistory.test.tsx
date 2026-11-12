import {expect,it,vi} from 'vitest';
import {HistoryScrollAnchor,initialHistoryStart,initialHistoryWindow} from './useConversationHistory';
import type {Message} from './types';

it('starts with the latest visible turns, including histories with system rows',()=>{
 const messages=Array.from({length:1000},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:'text'}) as Message);
 expect(initialHistoryStart(messages,true)).toBe(996);
 expect(initialHistoryStart([...messages,{role:'system'} as Message],true)).toBe(996);
 expect(initialHistoryStart(messages,false)).toBe(0);
 expect(initialHistoryStart(messages.slice(0,3),true)).toBe(0);
});

it('prepares a bounded window around a saved target instead of its entire remaining suffix',()=>{
 const messages=Array.from({length:1000},(_,i)=>({id:String(i),role:i%2?'assistant':'user',content:'text'}) as Message);
 expect(initialHistoryWindow(messages,true,'250')).toEqual({start:246,end:259});
 expect(initialHistoryWindow(messages,true,'0')).toEqual({start:0,end:9});
 expect(initialHistoryWindow(messages,true,'999')).toEqual({start:995,end:1000});
 expect(initialHistoryWindow(messages,true,'missing')).toEqual({start:996,end:1000});
 expect(initialHistoryWindow(messages,false,'250')).toEqual({start:0,end:1000});
});

it('keeps the visible DOM anchor while adding both earlier and later rows',()=>{
 const scroll={scrollTop:400,scrollHeight:2400,getBoundingClientRect:()=>({top:100,bottom:900}),querySelectorAll:()=>[row]};
 let offset=450;
 const row={dataset:{messageId:'reading'},getBoundingClientRect:()=>({top:offset-scroll.scrollTop+100,bottom:offset-scroll.scrollTop+300})};
 const previous={conversationKey:'account:chat:main',start:40,end:52,scroll:{current:scroll as unknown as HTMLDivElement},children:null};
 const current={...previous,start:36,end:56},anchor=new HistoryScrollAnchor(current);
 const snapshot=anchor.getSnapshotBeforeUpdate(previous);
 offset+=800;scroll.scrollHeight+=1600;anchor.componentDidUpdate(previous,{},snapshot);
 expect(scroll.scrollTop).toBe(1200); // Below-window growth does not affect this anchor.
 const afterNative=anchor.getSnapshotBeforeUpdate(previous);
 offset+=600;scroll.scrollHeight+=1100;scroll.scrollTop+=600;
 anchor.componentDidUpdate(previous,{},afterNative);
 expect(scroll.scrollTop).toBe(1800); // Native anchoring is not applied twice.
});

it('does not use bottom-distance compensation for a suffix-only expansion',()=>{
 const scroll={scrollTop:400,scrollHeight:2400};
 const previous={conversationKey:'account:chat:main',start:40,end:52,scroll:{current:scroll as unknown as HTMLDivElement},children:null};
 const anchor=new HistoryScrollAnchor({...previous,end:56}),snapshot=anchor.getSnapshotBeforeUpdate(previous);
 scroll.scrollHeight+=1000;anchor.componentDidUpdate(previous,{},snapshot);
 expect(scroll.scrollTop).toBe(400);
});

it('leaves layout and position to the explicit send/jump scroll owner',()=>{
 const read=vi.fn(()=>{throw new Error('A competing owner must not measure the scroll area')});
 const scroll={get scrollTop(){return read()},get scrollHeight(){return read()},getBoundingClientRect:read};
 const onAdjust=vi.fn();
 const previous={conversationKey:'account:chat:main',start:40,end:52,scroll:{current:scroll as unknown as HTMLDivElement},onAdjust,children:null};
 for(const window of [{start:36,end:52},{start:40,end:56}]){
  const anchor=new HistoryScrollAnchor({...previous,...window,suspended:true});
  const snapshot=anchor.getSnapshotBeforeUpdate(previous);
  expect(snapshot).toBeNull();
  anchor.componentDidUpdate(previous,{},snapshot);
 }
 expect(read).not.toHaveBeenCalled();
 expect(onAdjust).not.toHaveBeenCalled();
});

it('holds the exact text anchor when earlier messages are inserted, without double native anchoring',()=>{
 const scroll={scrollTop:400,scrollHeight:2400};
 const onAdjust=vi.fn();
 const previous={conversationKey:'account:chat:main',start:80,scroll:{current:scroll as unknown as HTMLDivElement},onAdjust,children:null};
 const current={...previous,start:76};
 const anchor=new HistoryScrollAnchor(current);
 const snapshot=anchor.getSnapshotBeforeUpdate(previous);
 scroll.scrollHeight+=820;anchor.componentDidUpdate(previous,{},snapshot);
 expect(scroll.scrollTop).toBe(1220);
 expect(onAdjust).toHaveBeenLastCalledWith(1220);
 // Native anchoring can already have compensated before the commit callback.
 const next=anchor.getSnapshotBeforeUpdate(previous);
 scroll.scrollHeight+=600;scroll.scrollTop+=600;
 anchor.componentDidUpdate(previous,{},next);
 expect(scroll.scrollTop).toBe(1820);
 expect(onAdjust).toHaveBeenCalledTimes(2);
 expect(new HistoryScrollAnchor({...current,conversationKey:'other'}).getSnapshotBeforeUpdate(previous)).toBeNull();
 expect(new HistoryScrollAnchor({...current,start:80}).getSnapshotBeforeUpdate(previous)).toBeNull();
 anchor.componentDidUpdate(previous,{},null);
 expect(scroll.scrollTop).toBe(1820);
 expect(onAdjust).toHaveBeenCalledTimes(2);
});
