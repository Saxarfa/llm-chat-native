import {expect,it,vi} from 'vitest';
import {PreparedContentCache} from './preparedContent';

it('reuses prepared output and invalidates changed text or source metadata',()=>{
 const cache=new PreparedContentCache<object>(),key={},sources={},create=vi.fn(()=>({}));
 const first=cache.prepare(key,'Answer',sources,create);
 expect(cache.prepare(key,'Answer',sources,create)).toBe(first);
 expect(create).toHaveBeenCalledTimes(1);
 expect(cache.prepare(key,'Edited',sources,create)).not.toBe(first);
 expect(cache.prepare(key,'Edited',{},create)).not.toBe(first);
 expect(create).toHaveBeenCalledTimes(3);
 cache.clear();cache.prepare(key,'Edited',sources,create);
 expect(create).toHaveBeenCalledTimes(4);
});

it('evicts least recently used entries and oversized content without growing unbounded',()=>{
 const cache=new PreparedContentCache<object>(2,20),a={},b={},c={},create=vi.fn(()=>({}));
 const first=cache.prepare(a,'a',null,create);
 cache.prepare(b,'b',null,create);cache.prepare(a,'a',null,create);cache.prepare(c,'c',null,create);
 expect(cache.prepare(a,'a',null,create)).toBe(first);
 const calls=create.mock.calls.length;cache.prepare(b,'b',null,create);
 expect(create).toHaveBeenCalledTimes(calls+1);
 const oversized='x'.repeat(21);
 const value=cache.prepare(c,oversized,null,create);
 expect(cache.prepare(c,oversized,null,create)).not.toBe(value);
});
