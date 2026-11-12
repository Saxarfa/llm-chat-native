import {afterEach,expect,it,vi} from 'vitest';
import {pollVisible} from './visiblePolling';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
function setup(){
 vi.useFakeTimers();const doc=Object.assign(new EventTarget(),{hidden:false});vi.stubGlobal('document',doc);
 const visible=(hidden:boolean)=>{doc.hidden=hidden;doc.dispatchEvent(new Event('visibilitychange'))};return{visible};
}
it('never overlaps a slow request and starts the delay after it completes',async()=>{
 setup();let resolve!:()=>void;const first=new Promise<void>(r=>{resolve=r}),refresh=vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined);
 const stop=pollVisible(refresh,1000);await vi.advanceTimersByTimeAsync(5000);expect(refresh).toHaveBeenCalledOnce();
 resolve();await vi.advanceTimersByTimeAsync(999);expect(refresh).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(1);expect(refresh).toHaveBeenCalledTimes(2);stop();
});
it('sleeps in a hidden tab and refreshes immediately on return',async()=>{
 const {visible}=setup(),refresh=vi.fn().mockResolvedValue(undefined);visible(true);
 const stop=pollVisible(refresh,1000);await vi.advanceTimersByTimeAsync(10000);expect(refresh).not.toHaveBeenCalled();
 visible(false);await vi.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledOnce();
 visible(true);await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledOnce();stop();visible(false);expect(refresh).toHaveBeenCalledOnce();
});
it('coalesces wakeups during an in-flight request and cancels future work on unmount',async()=>{
 const {visible}=setup();let resolve!:()=>void;const refresh=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{resolve=r})).mockResolvedValue(undefined);
 const stop=pollVisible(refresh,1000);visible(true);visible(false);visible(true);visible(false);expect(refresh).toHaveBeenCalledOnce();
 resolve();await vi.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(2);
 stop();await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledTimes(2);
});
it('recovers from a rejected poll without an unhandled rejection',async()=>{
 setup();const refresh=vi.fn().mockRejectedValueOnce(new Error('Synthetic failure')).mockResolvedValue(undefined),stop=pollVisible(refresh,1000);
 await vi.advanceTimersByTimeAsync(1000);expect(refresh).toHaveBeenCalledTimes(2);stop();
});
