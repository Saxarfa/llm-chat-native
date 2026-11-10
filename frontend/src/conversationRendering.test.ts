import {afterEach,describe,expect,it,vi} from 'vitest';
import {observeConversationRendering} from './conversationRendering';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
function setup(count=2){
 vi.useFakeTimers();
 let update!:ResizeObserverCallback,changed!:MutationCallback;
 const frames=new Map<number,FrameRequestCallback>();let nextFrame=0;
 const row=()=>{const values=new Map<string,string>(),classes=new Set<string>();return{classList:{contains:(name:string)=>classes.has(name),add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name)},dataset:{} as Record<string,string>,style:{setProperty:vi.fn((key:string,value:string)=>values.set(key,value)),getPropertyValue:(key:string)=>values.get(key)||'',removeProperty:(key:string)=>values.delete(key)},getBoundingClientRect:vi.fn(()=>({height:312.75}))}};
 const rows=Array.from({length:count},row);
 const column={querySelectorAll:vi.fn(()=>rows)};
 const observe=vi.fn(),disconnect=vi.fn(),unobserve=vi.fn();
 vi.stubGlobal('CSS',{supports:()=>true});
 vi.stubGlobal('getComputedStyle',(element:ReturnType<typeof row>)=>({height:`${element.getBoundingClientRect().height}px`}));
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++nextFrame,fn);return nextFrame});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 vi.stubGlobal('ResizeObserver',class{
  constructor(fn:ResizeObserverCallback){update=fn}
  observe=observe;disconnect=disconnect;unobserve=unobserve;
 });
 vi.stubGlobal('MutationObserver',class{constructor(fn:MutationCallback){changed=fn}observe=vi.fn();disconnect=vi.fn()});
 const cleanup=observeConversationRendering(column as unknown as HTMLElement);
 const entry=(target:object,width:number,height:number)=>({target,contentRect:{width,height}} as ResizeObserverEntry);
 const deliver=(...entries:ResizeObserverEntry[])=>update(entries,{} as ResizeObserver);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0))};
 return {rows,column,cleanup,observe,disconnect,unobserve,deliver,entry,flush,frames,row,changed:()=>changed([],{} as MutationObserver)};
}
describe('large conversation rendering',()=>{
 it('avoids inherited CSS writes while streaming, then caches the completed size',()=>{
  const {rows,deliver,entry,flush,frames}=setup(1),reply=rows[0];reply.classList.add('live-message');
  for(let height=100;height<1000;height+=20)deliver(entry(reply,700,height));
  expect(frames.size).toBe(0);
  flush();vi.advanceTimersByTime(400);
  expect(reply.style.setProperty).not.toHaveBeenCalled();
  expect(reply.dataset.renderCached).toBeUndefined();
  reply.classList.remove('live-message');deliver(entry(reply,700,1024.5));flush();
  expect(reply.style.getPropertyValue('--message-render-height')).toBe('1024.5px');
  expect(reply.dataset.renderCached).toBe('true');
 });
 it('coalesces row measurements and drops removed rows before the next frame',()=>{
  const {rows,deliver,entry,flush,frames,changed}=setup(2),removed=rows[1];
  deliver(entry(rows[0],700,120),entry(removed,700,160));
  deliver(entry(rows[0],700,140));
  expect(frames.size).toBe(1);
  expect(rows[0].style.setProperty).not.toHaveBeenCalled();
  rows.pop();changed();flush();
  expect(rows[0].style.getPropertyValue('--message-render-height')).toBe('140px');
  expect(removed.style.setProperty).not.toHaveBeenCalled();
 });
 it('keeps exact measured heights in a thousand-message chat without synchronous layout scans',()=>{
  const {rows,column,deliver,entry,observe,flush}=setup(1000);
  deliver(entry(column,700,0),...rows.map(row=>entry(row,700,412.375)));
  expect(rows.every(row=>!row.style.setProperty.mock.calls.length)).toBe(true);
  flush();
  expect(rows.every(row=>!row.dataset.renderCached)).toBe(true);
  vi.advanceTimersByTime(400);
  expect(observe).toHaveBeenCalledTimes(1001);
  for(const row of rows){
   expect(row.dataset.renderCached).toBe('true');
   expect(row.style.getPropertyValue('--message-render-height')).toBe('412.375px');
   expect(row.getBoundingClientRect).not.toHaveBeenCalled();
  }
  const writes=rows[0].style.setProperty.mock.calls.length;
  deliver(entry(rows[0],700,412.375));flush();
  expect(rows[0].style.setProperty).toHaveBeenCalledTimes(writes);
 });
 it('clears stale heights on a width change and measures all rows before restoring containment',()=>{
  const {rows,column,deliver,entry,flush}=setup();
  deliver(entry(column,700,0),...rows.map(row=>entry(row,700,400)));flush();
  vi.advanceTimersByTime(400);
  deliver(entry(column,340,0),entry(rows[0],340,400));
  // No containment writes inside ResizeObserver delivery itself.
  expect(rows.every(row=>row.dataset.renderCached==='true')).toBe(true);
  rows[0].getBoundingClientRect.mockImplementation(()=>{expect(rows.every(row=>!row.dataset.renderCached)).toBe(true);return{height:523.125}});
  flush();
  expect(rows[0].style.getPropertyValue('--message-render-height')).toBe('523.125px');
  expect(rows[1].style.getPropertyValue('--message-render-height')).toBe('312.75px');
 });
 it('does not cache zero/invalid heights and cancels pending work on cleanup',()=>{
  const {rows,column,deliver,entry,cleanup,frames,flush,disconnect}=setup();
  deliver(entry(column,700,0),entry(rows[0],700,0),entry(rows[1],700,NaN));
  expect(rows.every(row=>!row.dataset.renderCached)).toBe(true);
  deliver(entry(column,340,0));expect(frames.size).toBe(1);
  cleanup();flush();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(rows.every(row=>!row.dataset.renderCached)).toBe(true);
  expect(rows[0].getBoundingClientRect).not.toHaveBeenCalled();
 });
 it('preserves ordinary rendering when browser support is absent',()=>{
  vi.stubGlobal('CSS',{supports:()=>false});
  const column={querySelectorAll:vi.fn()};
  observeConversationRendering(column as unknown as HTMLElement)();
  expect(column.querySelectorAll).not.toHaveBeenCalled();
 });
 it('observes newly prepared rows without clearing previously measured rows',()=>{
  const {rows,column,row,deliver,entry,changed,observe,unobserve,flush}=setup(1);
  const first=rows[0];deliver(entry(column,700,0),entry(first,700,400));flush();vi.advanceTimersByTime(400);
  const next=row();rows.unshift(next);changed();
  expect(first.dataset.renderCached).toBe('true');
  expect(first.style.getPropertyValue('--message-render-height')).toBe('400px');
  expect(observe).toHaveBeenCalledTimes(3);
  deliver(entry(next,700,260));flush();expect(next.dataset.renderCached).toBe('true');
  rows.pop();changed();expect(unobserve).toHaveBeenCalledWith(first);
  expect(first.dataset.renderCached).toBeUndefined();
 });
});
