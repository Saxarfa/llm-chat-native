import {expect,it,vi} from 'vitest';
import {createComposerBuffer} from './composerBuffer';

function fixture(){
 let id=0;
 const frames=new Map<number,FrameRequestCallback>();
 const schedule=vi.fn((callback:FrameRequestCallback)=>{const next=id++;frames.set(next,callback);return next});
 const cancel=vi.fn((handle:number)=>{frames.delete(handle)});
 const buffer=createComposerBuffer(schedule,cancel);
 const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(0))};
 return {buffer,schedule,cancel,frames,paint};
}

it('reads the first character immediately while delivering a stable semantic snapshot after the event',()=>{
 const {buffer,schedule,paint}=fixture(),listener=vi.fn();buffer.subscribe(listener);
 expect(buffer.read()).toBe('');expect(buffer.hasText()).toBe(false);
 buffer.write('a');
 expect(buffer.read()).toBe('a');expect(buffer.hasText()).toBe(false);expect(listener).not.toHaveBeenCalled();
 buffer.write('ab');buffer.write('abc');
 expect(schedule).toHaveBeenCalledTimes(1);paint();
 expect(buffer.read()).toBe('abc');expect(buffer.hasText()).toBe(true);expect(listener).toHaveBeenCalledTimes(1);
 buffer.write('abcd');buffer.write('abcd ');
 expect(schedule).toHaveBeenCalledTimes(1);expect(listener).toHaveBeenCalledTimes(1);
});

it('delivers full deletion once and treats whitespace as an empty draft',()=>{
 const {buffer,paint,schedule}=fixture(),listener=vi.fn();buffer.subscribe(listener);
 buffer.write('draft');paint();listener.mockClear();
 buffer.write('');buffer.write(' \n\t');
 expect(buffer.read()).toBe(' \n\t');expect(buffer.hasText()).toBe(true);expect(listener).not.toHaveBeenCalled();
 paint();
 expect(buffer.hasText()).toBe(false);expect(listener).toHaveBeenCalledTimes(1);expect(schedule).toHaveBeenCalledTimes(2);
 buffer.write('new');paint();expect(buffer.hasText()).toBe(true);expect(listener).toHaveBeenCalledTimes(2);
});

it('coalesces a same-frame round trip without publishing a transient empty/nonempty state',()=>{
 const {buffer,paint,frames}=fixture(),listener=vi.fn();buffer.subscribe(listener);
 buffer.write('first');buffer.write('');
 expect(frames.size).toBe(1);paint();
 expect(buffer.read()).toBe('');expect(buffer.hasText()).toBe(false);expect(listener).not.toHaveBeenCalled();
 buffer.write('draft');paint();listener.mockClear();
 buffer.write('');buffer.write('replacement');paint();
 expect(buffer.read()).toBe('replacement');expect(buffer.hasText()).toBe(true);expect(listener).not.toHaveBeenCalled();
});

it('unsubscribes listeners and cancels pending delivery on dispose, including frame handle zero',()=>{
 const {buffer,paint,cancel,frames,schedule}=fixture(),listener=vi.fn();
 const unsubscribe=buffer.subscribe(listener);buffer.write('pending');
 expect(frames.has(0)).toBe(true);unsubscribe();buffer.dispose();
 expect(cancel).toHaveBeenCalledWith(0);expect(frames.size).toBe(0);
 buffer.write('ignored');buffer.subscribe(listener);paint();
 expect(buffer.read()).toBe('pending');expect(buffer.hasText()).toBe(false);
 expect(schedule).toHaveBeenCalledTimes(1);expect(listener).not.toHaveBeenCalled();
});
