import {afterEach,expect,it,vi} from 'vitest';
import {reconnectDelay} from './reconnectDelay';
afterEach(()=>vi.useRealTimers());
it('manual retry wakes the backoff immediately and leaves no timer',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let finished=false;
 const wait=reconnectDelay(controller.signal).then(()=>{finished=true});
 expect(finished).toBe(false);controller.abort();await wait;
 expect(finished).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('waits before automatic retries but skips waiting after an aborted stream',async()=>{
 vi.useFakeTimers();const controller=new AbortController();let finished=false;
 const wait=reconnectDelay(controller.signal).then(()=>{finished=true});
 await vi.advanceTimersByTimeAsync(2499);expect(finished).toBe(false);
 await vi.advanceTimersByTimeAsync(1);await wait;expect(finished).toBe(true);
 controller.abort();await reconnectDelay(controller.signal);expect(vi.getTimerCount()).toBe(0);
});
