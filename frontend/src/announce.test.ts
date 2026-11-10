import {afterEach,describe,expect,it,vi} from 'vitest';

// Minimal DOM stand-in: the test environment has no jsdom.
function fakeDocument(){
 const appended:any[]=[];
 const createElement=()=>{const attrs:Record<string,string>={};return {className:'',textContent:'',isConnected:true,setAttribute:(k:string,v:string)=>{attrs[k]=v},getAttribute:(k:string)=>attrs[k]??null}};
 return {appended,doc:{createElement,body:{append:(node:any)=>appended.push(node)}}};
}

describe('announce',()=>{
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.resetModules()});
 it('uses one polite status region and repeats identical notices',async()=>{
  vi.useFakeTimers();
  const {appended,doc}=fakeDocument();
  vi.stubGlobal('document',doc);vi.stubGlobal('window',globalThis);
  const {announce}=await import('./announce');
  announce('Ответ готов');vi.advanceTimersByTime(100);
  expect(appended).toHaveLength(1);
  expect(appended[0].getAttribute('role')).toBe('status');
  expect(appended[0].getAttribute('aria-atomic')).toBe('true');
  expect(appended[0].textContent).toBe('Ответ готов');
  announce('Ответ готов');
  expect(appended[0].textContent).toBe('');
  vi.advanceTimersByTime(100);
  expect(appended).toHaveLength(1);
  expect(appended[0].textContent).toBe('Ответ готов');
 });
});
