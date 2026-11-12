import {afterEach,describe,expect,it,vi} from 'vitest';
import {resetHapticThrottleForTests,triggerHaptic,triggerStreamTokenHaptic} from './haptics';

afterEach(()=>{
 resetHapticThrottleForTests();
 vi.unstubAllGlobals();
});

describe('mobile haptics',()=>{
 it('uses navigator.vibrate on coarse-pointer Android devices and throttles rapid calls',()=>{
  const vibrate=vi.fn(()=>true);
  vi.stubGlobal('window',{matchMedia:(query:string)=>({matches:query==='(pointer: coarse)'})});
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (Linux; Android 14)',vibrate});
  expect(triggerHaptic('light')).toBe(true);
  expect(vibrate).toHaveBeenCalledWith(8);
  expect(triggerHaptic('light')).toBe(false);
 });

 it('routes haptics and streaming token ticks directly to the native iOS CoreHaptics bridge when available',()=>{
  const postMessage=vi.fn();
  vi.stubGlobal('window',{
   matchMedia:()=>({matches:false}),
   webkit:{messageHandlers:{llmNativeHaptics:{postMessage}}}
  });
  expect(triggerHaptic('send')).toBe(true);
  expect(postMessage).toHaveBeenCalledWith({type:'send'});
  expect(triggerStreamTokenHaptic('Привет ')).toBe(true);
  expect(postMessage).toHaveBeenCalledWith({type:'token',boundary:true});
  expect(triggerStreamTokenHaptic('мир')).toBe(false);
 });

 it('triggers the hidden iOS switch input when navigator.vibrate is unavailable on iPhone',()=>{
  let clicked=0;
  const labelStub={
   isConnected:true,
   dataset:{} as Record<string,string>,
   style:{cssText:''},
   setAttribute:vi.fn(),
   appendChild:vi.fn(),
   click:()=>{clicked++}
  };
  const inputStub={type:'',tabIndex:0,setAttribute:vi.fn()};
  vi.stubGlobal('window',{matchMedia:(query:string)=>({matches:query==='(pointer: coarse)'})});
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
  vi.stubGlobal('document',{
   body:{appendChild:vi.fn()},
   createElement:(tag:string)=>tag==='label'?labelStub:inputStub
  });
  expect(triggerHaptic('medium')).toBe(true);
  expect(inputStub.setAttribute).toHaveBeenCalledWith('switch','');
  expect((labelStub as typeof labelStub&{inert?:boolean}).inert).toBe(true);
  expect(clicked).toBe(1);
 });

 it('stays silent when prefers-reduced-motion is enabled or on desktop fine pointers',()=>{
  const vibrate=vi.fn();
  vi.stubGlobal('window',{matchMedia:(query:string)=>({matches:query==='(prefers-reduced-motion: reduce)'})});
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 (iPhone)',vibrate});
  expect(triggerHaptic('light')).toBe(false);
  expect(vibrate).not.toHaveBeenCalled();
 });
});
