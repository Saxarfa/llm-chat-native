import {afterEach,expect,it,vi} from 'vitest';
import {createChatArtCache} from './chatArtCache';
afterEach(()=>vi.restoreAllMocks());
it('reuses an art after leaving the chat and deduplicates concurrent loads',async()=>{
 const cache=createChatArtCache(),load=vi.fn(async()=>({url:'blob:art',size:20}));
 const first=cache.retain('owner:art',load),second=cache.retain('owner:art',load);
 expect(await first.promise).toBe('blob:art');expect(await second.promise).toBe('blob:art');
 first.release();second.release();expect(cache.peek('owner:art')).toBe('blob:art');
 const returned=cache.retain('owner:art',load);expect(await returned.promise).toBe('blob:art');expect(load).toHaveBeenCalledTimes(1);returned.release();
});
it('finishes a load after switching away so returning can restore it',async()=>{
 const cache=createChatArtCache();let complete!:(value:{url:string;size:number})=>void;
 const first=cache.retain('art',()=>new Promise(resolve=>{complete=resolve}));
 await Promise.resolve();first.release();complete({url:'blob:art',size:20});await first.promise;
 expect(cache.peek('art')).toBe('blob:art');
});
it('evicts old inactive art without revoking a displayed one',async()=>{
 const revoke=vi.spyOn(URL,'revokeObjectURL'),cache=createChatArtCache(30);
 const first=cache.retain('one',async()=>({url:'blob:one',size:20}));await first.promise;
 const second=cache.retain('two',async()=>({url:'blob:two',size:20}));await second.promise;
 expect(revoke).not.toHaveBeenCalled();first.release();expect(revoke).toHaveBeenCalledWith('blob:one');expect(cache.peek('two')).toBe('blob:two');
 second.release();expect(revoke).toHaveBeenCalledTimes(1);
});
it('allows retry after failure and separates accounts',async()=>{
 const cache=createChatArtCache(),failed=cache.retain('a:art',async()=>{throw Error('Offline')});
 await expect(failed.promise).rejects.toThrow('Offline');failed.release();expect(cache.peek('a:art')).toBe('');
 const retry=cache.retain('a:art',async()=>({url:'blob:a',size:1})),other=cache.retain('b:art',async()=>({url:'blob:b',size:1}));
 expect(await retry.promise).toBe('blob:a');expect(await other.promise).toBe('blob:b');retry.release();other.release();
});
