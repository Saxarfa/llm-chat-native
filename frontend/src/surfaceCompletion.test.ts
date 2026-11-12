import {afterEach,expect,it,vi} from 'vitest';
import {afterSurfaceMotion} from './surfaceCompletion';

afterEach(()=>vi.unstubAllGlobals());
function setup(){let paint=()=>{};vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{paint=fn;return 1});vi.stubGlobal('cancelAnimationFrame',vi.fn());return()=>paint()}
it('finishes only after the actual surface animations settle',async()=>{
 const paint=setup(),done=vi.fn();let resolve!:()=>void;
 const animation={finished:new Promise<void>(r=>{resolve=r}),playState:'running',effect:{getComputedTiming:()=>({iterations:1})}};
 afterSurfaceMotion({getAnimations:()=>[animation]} as unknown as HTMLElement,done);paint();expect(done).not.toHaveBeenCalled();
 resolve();await Promise.resolve();await Promise.resolve();expect(done).toHaveBeenCalledOnce();
});
it('ignores infinite activity and completes an unanimated/reduced surface',()=>{
 const paint=setup(),done=vi.fn();afterSurfaceMotion({getAnimations:()=>[{playState:'running',effect:{getComputedTiming:()=>({iterations:Infinity})}}]} as unknown as HTMLElement,done);paint();expect(done).toHaveBeenCalledOnce();
});
it('never completes an obsolete close after reopening',async()=>{
 const paint=setup(),done=vi.fn();let resolve!:()=>void;
 const cancel=afterSurfaceMotion({getAnimations:()=>[{finished:new Promise<void>(r=>{resolve=r}),playState:'running',effect:{getComputedTiming:()=>({iterations:1})}}]} as unknown as HTMLElement,done);
 paint();cancel();resolve();await Promise.resolve();await Promise.resolve();expect(done).not.toHaveBeenCalled();
});
