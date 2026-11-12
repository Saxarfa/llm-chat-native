import {expect,it} from 'vitest';
import {shareSnapshot} from './shareSnapshot';

it('keeps equal history and settings stable while applying a new answer or edited source',()=>{
 const previous={messages:[{id:'u',content:'Question'},{id:'a',content:'Answer',sources:[{title:'Old',url:'https://example.com'}]}],overrides:{temperature:.7}};
 expect(shareSnapshot(previous,structuredClone(previous))).toBe(previous);
 const changed=structuredClone(previous);changed.messages[1].sources![0].title='Updated';
 const shared=shareSnapshot(previous,changed);
 expect(shared).toEqual(changed);
 expect(shared.messages[0]).toBe(previous.messages[0]);
 expect(shared.messages[1]).not.toBe(previous.messages[1]);
 expect(shared.overrides).toBe(previous.overrides);
 expect(previous.messages[1].sources![0].title).toBe('Old');
});

it('preserves removals, explicit nulls, changed branches and array length',()=>{
 const previous={branch:'main',messages:[{id:'a',reasoning:'Private',content:'First'}],extra:true};
 const next={branch:'fork',messages:[{id:'a',reasoning:null,content:'Changed'},{id:'b',content:'Second'}]};
 const result=shareSnapshot<unknown>(previous,next);
 expect(result).toEqual(next);
 expect(Object.hasOwn(result as object,'extra')).toBe(false);
 expect(shareSnapshot([1,2],[1])).toEqual([1]);
});
