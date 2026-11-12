import {beforeEach,expect,it,vi} from 'vitest';

// Drive the public hook contract without a DOM. The harness preserves hook
// slots across renders and applies React's queued functional state updates.
const hooks=vi.hoisted(()=>({slots:[] as unknown[],index:0,cleanup:undefined as undefined|(()=>void)}));
vi.mock('react',()=>({
 useState:(initial:unknown)=>{const index=hooks.index++;if(!(index in hooks.slots))hooks.slots[index]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [hooks.slots[index],(next:unknown)=>{hooks.slots[index]=typeof next==='function'?(next as (previous:unknown)=>unknown)(hooks.slots[index]):next}]},
 useRef:(value:unknown)=>{const index=hooks.index++;if(!(index in hooks.slots))hooks.slots[index]={current:value};return hooks.slots[index]},
 useCallback:<T,>(callback:T)=>callback,
 useEffect:(effect:()=>undefined|(()=>void))=>{if(!hooks.cleanup)hooks.cleanup=effect()||undefined},
}));
import {usePreparedPage} from './usePreparedPage';

const render=()=>{hooks.index=0;return usePreparedPage()};
beforeEach(()=>{hooks.slots=[];hooks.index=0;hooks.cleanup=undefined});

it('retains the presented page until readiness and shares repeated requests',async()=>{
 let page=render();const first=page.request('workspace');
 page=render();expect(page.page).toBe('chat');expect(page.pending?.target).toBe('workspace');
 expect(page.request('workspace')).toBe(first);
 page.ready(page.pending!.id);expect(await first).toBe(true);
 page=render();expect(page.page).toBe('workspace');expect(page.pending).toBeUndefined();
});

it('rejects cancelled preparation and ignores its late readiness or error',async()=>{
 let page=render();const old=page.request('workspace');page=render();const oldId=page.pending!.id;
 const latest=page.request('images');page=render();const id=page.pending!.id;
 expect(await old).toBe(false);page.ready(oldId);page.ready(oldId,'old failure');
 page=render();expect(page.page).toBe('chat');expect(page.pending?.id).toBe(id);
 page.ready(id);expect(await latest).toBe(true);expect(render().page).toBe('images');
});

it('keeps the source on failure and admits a fresh retry only after readiness',async()=>{
 let page=render();const failed=page.request('workspace');page=render();const failedId=page.pending!.id;
 page.ready(failedId,'synthetic failure');expect(await failed).toBe(false);
 page=render();expect(page.page).toBe('chat');expect(page.pending?.status).toBe('error');
 const retry=page.request('workspace');page=render();const retryId=page.pending!.id;
 expect(retryId).toBeGreaterThan(failedId);expect(page.pending?.status).toBe('loading');
 page.ready(failedId);expect(render().page).toBe('chat');page.ready(retryId);
 expect(await retry).toBe(true);expect(render().page).toBe('workspace');
});

it('selecting the source cancels preparation and returning cannot revive it',async()=>{
 let page=render();const request=page.request('images');page=render();const id=page.pending!.id;
 expect(await page.request('chat')).toBe(true);expect(await request).toBe(false);
 page.ready(id);page=render();expect(page.page).toBe('chat');expect(page.pending).toBeUndefined();
});

it('unmount resolves outstanding work as cancelled',async()=>{
 let page=render();const request=page.request('workspace');page=render();const id=page.pending!.id;
 hooks.cleanup?.();expect(await request).toBe(false);page.ready(id);
 expect(render().page).toBe('chat');
});
