import {afterEach,expect,it,vi} from 'vitest';
import {observeComposerInputTiming} from './composerInputTiming';

function harness(source?:string){
 vi.useFakeTimers();vi.setSystemTime(100);let serial=0;
 const frames=new Map<number,FrameRequestCallback>(),report=vi.fn();
 const win=Object.assign(new EventTarget(),{
  performance:{now:()=>Date.now()},navigator:{standalone:true},matchMedia:()=>({matches:false}),
  requestAnimationFrame:(fn:FrameRequestCallback)=>{const handle=serial++;frames.set(handle,fn);return handle},cancelAnimationFrame:(id:number)=>frames.delete(id),
  setTimeout:(fn:()=>void,delay:number)=>setTimeout(fn,delay),clearTimeout:(handle:ReturnType<typeof setTimeout>)=>clearTimeout(handle),
 });
 const doc=Object.assign(new EventTarget(),{defaultView:win,hidden:false,activeElement:null as EventTarget|null});
 const field=Object.assign(new EventTarget(),{ownerDocument:doc,getBoundingClientRect:()=>{throw Error('layout read')}});
 // These throwing properties protect both input/textarea privacy and layout.
 for(const property of ['value','selectionStart','selectionEnd','scrollHeight','clientHeight','offsetHeight'])Object.defineProperty(field,property,{get:()=>{throw Error('private or layout read')}});
 const dispose=observeComposerInputTiming(field as unknown as HTMLInputElement,report,source);
 const emit=(type:string,options:{composing?:boolean;cancel?:boolean;dispatchWait?:number}={})=>{
  const event=new Event(type,{cancelable:true});Object.defineProperty(event,'timeStamp',{value:Date.now()-(options.dispatchWait||0)});
  Object.defineProperty(event,'isComposing',{value:!!options.composing});
  for(const property of ['key','data','inputType'])Object.defineProperty(event,property,{get:()=>{throw Error('private event read')}});
  if(options.cancel)event.preventDefault();field.dispatchEvent(event);return event;
 };
 return {doc,field,report,dispose,frames,emit,focus:()=>{doc.activeElement=field;emit('focus')},advance:(ms:number)=>vi.advanceTimersByTime(ms),paint:(ms=16)=>{
  vi.advanceTimersByTime(ms);const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(Date.now()));
 }};
}
afterEach(()=>vi.useRealTimers());

it('separates native edit and two render phases with aggregates only, without private or layout reads',()=>{
 const h=harness();h.focus();
 h.emit('keydown');h.advance(5);h.emit('beforeinput');h.advance(600);h.emit('input',{dispatchWait:2});h.paint(12);h.paint(20);
 expect(h.report).not.toHaveBeenCalled();h.emit('blur');
 const expected={key_to_beforeinput:5,beforeinput_to_input:600,key_to_event:605,input_to_frame:12,frame_to_frame:20,render_wait:32,dispatch_wait:2};
 for(const [name,duration] of Object.entries(expected))expect(h.report).toHaveBeenCalledWith({state:`input_${name}`,source:'composer-pwa',duration_ms:duration,elapsed_ms:duration,count:1});
 expect(h.frames.size).toBe(0);expect(vi.getTimerCount()).toBe(0);h.dispose();
});

it('keeps maximum, average and count across edits and shares one pending render probe',()=>{
 const h=harness('input-check-line');h.focus();
 h.emit('keydown');h.advance(3);h.emit('beforeinput');h.advance(7);h.emit('input');
 h.emit('keydown');h.advance(5);h.emit('beforeinput');h.advance(15);h.emit('input');
 expect(h.frames.size).toBe(1);h.paint();h.paint();h.emit('blur');
 expect(h.report).toHaveBeenCalledWith({state:'input_key_to_beforeinput',source:'input-check-line',duration_ms:5,elapsed_ms:4,count:2});
 expect(h.report).toHaveBeenCalledWith({state:'input_beforeinput_to_input',source:'input-check-line',duration_ms:15,elapsed_ms:11,count:2});
 expect(h.report.mock.calls.filter(([value])=>value.state==='input_render_wait')).toHaveLength(1);h.dispose();
});

it('does not pair cancelled beforeinput with a later keystroke or input',()=>{
 const h=harness();h.focus();
 h.emit('keydown');h.advance(5);h.emit('beforeinput',{cancel:true});h.advance(650);
 h.emit('keydown');h.advance(10);h.emit('input');h.paint();h.paint();
 h.emit('keydown');h.emit('beforeinput',{cancel:true});h.advance(500);h.emit('input');h.paint();h.paint();h.emit('blur');
 expect(h.report).toHaveBeenCalledWith({state:'input_key_to_event',source:'composer-pwa',duration_ms:10,elapsed_ms:10,count:1});
 expect(h.report.mock.calls.some(([value])=>['input_key_to_beforeinput','input_beforeinput_to_input'].includes(value.state))).toBe(false);h.dispose();
});

it('observes cancellation added after the capture listener',()=>{
 const h=harness();h.focus();h.emit('keydown');const before=h.emit('beforeinput');before.preventDefault();h.advance(600);h.emit('input');h.paint();h.paint();h.emit('blur');
 expect(h.report.mock.calls.some(([value])=>value.state==='input_key_to_event'||value.state==='input_beforeinput_to_input')).toBe(false);h.dispose();
});

it('resets all pending phase timestamps at composition boundaries while allowing committed edits',()=>{
 const h=harness();h.focus();h.emit('keydown');h.emit('beforeinput');h.emit('input');
 expect(h.frames.has(0)).toBe(true);h.emit('compositionstart');expect(h.frames.size).toBe(0);
 h.advance(2000);h.emit('keydown',{composing:true});h.emit('beforeinput',{composing:true});h.emit('input',{composing:true});
 h.emit('compositionend');expect(h.frames.size).toBe(0);
 h.emit('keydown');h.advance(2);h.emit('beforeinput');h.advance(8);h.emit('input');h.paint();h.paint();h.emit('blur');
 expect(h.report).toHaveBeenCalledWith({state:'input_key_to_event',source:'composer-pwa',duration_ms:10,elapsed_ms:5,count:2});
 expect(h.report).toHaveBeenCalledWith({state:'input_beforeinput_to_input',source:'composer-pwa',duration_ms:8,elapsed_ms:4,count:2});
 expect(h.report.mock.calls.find(([value])=>value.state==='input_render_wait')?.[0].count).toBe(1);h.dispose();
});

it('excludes background and unfocused intervals and cancels pending work',()=>{
 const h=harness('input-check-area');h.focus();h.emit('keydown');h.emit('beforeinput');h.emit('input');h.paint();
 h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));
 expect(h.frames.size).toBe(0);expect(vi.getTimerCount()).toBe(0);const reports=h.report.mock.calls.length;
 h.advance(2000);h.emit('input');expect(h.report).toHaveBeenCalledTimes(reports);
 h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));h.emit('input');h.paint();h.paint();h.emit('blur');
 expect(h.report).toHaveBeenCalledWith({state:'input_render_wait',source:'input-check-area',duration_ms:32,elapsed_ms:32,count:1});
 expect(h.frames.size).toBe(0);expect(vi.getTimerCount()).toBe(0);h.dispose();
});

it('bounds report windows to eight and removes all work and listeners on disposal',()=>{
 const h=harness();h.focus();
 for(let i=0;i<12;i++){h.emit('keydown');h.emit('beforeinput');h.emit('input');h.paint();h.paint();h.advance(15000)}
 expect(h.report.mock.calls.filter(([value])=>value.state==='input_dispatch_wait')).toHaveLength(8);
 expect(vi.getTimerCount()).toBe(0);h.dispose();h.emit('focus');h.emit('input');expect(h.frames.size).toBe(0);
});

it('disposes an unpainted frame handle zero and an unpublished batch',()=>{
 const h=harness();h.focus();h.emit('keydown');h.emit('beforeinput');h.emit('input');
 expect(h.frames.has(0)).toBe(true);h.dispose();
 expect(h.frames.size).toBe(0);expect(vi.getTimerCount()).toBe(0);const reports=h.report.mock.calls.length;
 h.emit('focus');h.emit('beforeinput');h.emit('input');h.advance(30000);expect(h.report).toHaveBeenCalledTimes(reports);
});
