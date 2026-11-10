import {afterEach,describe,expect,it,vi} from 'vitest';
import {NanoMediaCache} from './nanoMedia';
afterEach(()=>vi.restoreAllMocks());
describe('Nano media ownership and loading',()=>{
 it('shares one download across consumers, with independent account data',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(new Blob(['image'],{type:'image/png'})));
  const cache=new NanoMediaCache();const [first,second]=await Promise.all([cache.load('a','/image',{}),cache.load('a','/image',{})]);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(first.url).toBe(second.url);
  const other=await cache.load('b','/image',{});expect(fetcher).toHaveBeenCalledTimes(2);expect(other.url).not.toBe(first.url);
  first.release();second.release();other.release();cache.clear('a');expect(cache.snapshot('b','/image').url).toBe(other.url);cache.clear('b');
 });
 it('cancels a pending fetch only after its last consumer leaves',async()=>{
  let signal:AbortSignal|undefined;vi.spyOn(globalThis,'fetch').mockImplementation((_url,options)=>{signal=options?.signal as AbortSignal;return new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))});
  const cache=new NanoMediaCache(),one=cache.retain('a','/pending',{}),two=cache.retain('a','/pending',{});
  one();await Promise.resolve();expect(signal?.aborted).toBe(false);two();await Promise.resolve();expect(signal?.aborted).toBe(true);
 });
 it('evicts unused blobs, keeps displayed images alive and permits explicit retry',async()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Blob(['123456'])));
  const revoke=vi.spyOn(URL,'revokeObjectURL'),cache=new NanoMediaCache(4),active=await cache.load('a','/active',{});
  fetcher.mockResolvedValueOnce(new Response(new Blob(['abcdef'])));const unused=await cache.load('a','/unused',{});unused.release();await Promise.resolve();
  expect(revoke).toHaveBeenCalledWith(unused.url);expect(cache.snapshot('a','/active').url).toBe(active.url);
  fetcher.mockResolvedValueOnce(new Response('',{status:503}));await expect(cache.load('a','/retry',{})).rejects.toThrow();
  fetcher.mockResolvedValueOnce(new Response(new Blob(['ok'])));const recovered=await cache.load('a','/retry',{});expect(recovered.url).toBeTruthy();recovered.release();active.release();cache.clear('a');
 });
});
