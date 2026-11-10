import {afterEach,describe,expect,it,vi} from 'vitest';
import {observeBottomButton} from './bottomButtonVisibility';

afterEach(()=>vi.unstubAllGlobals());
function setup(){
 const frames=new Map<number,FrameRequestCallback>();let sequence=0,resize!:()=>void;
 const column={},scroll=Object.assign(new EventTarget(),{scrollHeight:3000,clientHeight:600,scrollTop:2400,querySelector:()=>column});
 const observe=vi.fn(),disconnect=vi.fn(),onChange=vi.fn();
 const viewport=new EventTarget();vi.stubGlobal('window',viewport);
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resize=callback}observe=observe;disconnect=disconnect});
 const cleanup=observeBottomButton(scroll as unknown as HTMLElement,onChange);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0))};
 const move=(distance:number)=>{scroll.scrollTop=scroll.scrollHeight-scroll.clientHeight-distance;scroll.dispatchEvent(new Event('scroll'))};
 return {scroll,onChange,flush,move,frames,cleanup,observe,disconnect,viewport,resize:()=>resize()};
}
describe('isolated scroll-to-bottom button',()=>{
 it('batches a scroll burst and publishes only visibility transitions',()=>{
  const s=setup();s.flush();expect(s.onChange).not.toHaveBeenCalled();
  for(let i=0;i<100;i++)s.move(150+i);
  expect(s.frames.size).toBe(1);s.flush();
  expect(s.onChange.mock.calls).toEqual([[true]]);
  for(let i=0;i<100;i++){s.move(250+i);s.flush()}
  expect(s.onChange).toHaveBeenCalledTimes(1);
  s.move(0);s.flush();expect(s.onChange.mock.calls).toEqual([[true],[false]]);
 });
 it('does not flicker around the threshold and ignores Safari overscroll',()=>{
  const s=setup();s.move(101);s.flush();
  for(const distance of [99,101,98,80,73]){s.move(distance);s.flush()}
  expect(s.onChange.mock.calls).toEqual([[true]]);
  s.move(72);s.flush();s.move(-180);s.flush();
  expect(s.onChange.mock.calls).toEqual([[true],[false]]);
  s.scroll.scrollHeight=s.scroll.clientHeight;s.scroll.scrollTop=-150;s.resize();s.flush();
  expect(s.onChange).toHaveBeenCalledTimes(2);
 });
 it('tracks content/viewport resize and removes pending callbacks on unmount',()=>{
  const s=setup();s.flush();expect(s.observe).toHaveBeenCalledTimes(2);
  s.scroll.scrollHeight+=500;s.resize();s.flush();expect(s.onChange).toHaveBeenLastCalledWith(true);
  s.move(0);s.viewport.dispatchEvent(new Event('mobile-viewport-settled'));expect(s.frames.size).toBe(1);
  s.cleanup();s.flush();s.move(300);s.viewport.dispatchEvent(new Event('mobile-viewport-settled'));
  expect(s.frames.size).toBe(0);expect(s.disconnect).toHaveBeenCalledOnce();expect(s.onChange).toHaveBeenCalledTimes(1);
 });
 it('does not read layout dimensions in animation frames or scroll bursts',()=>{
  const s=setup(),height=vi.fn(()=>3000),viewport=vi.fn(()=>600);
  Object.defineProperties(s.scroll,{scrollHeight:{get:height,configurable:true},clientHeight:{get:viewport,configurable:true}});
  s.flush();for(let i=0;i<50;i++){s.scroll.scrollTop=1500+i;s.scroll.dispatchEvent(new Event('scroll'));s.flush()}
  expect(height).not.toHaveBeenCalled();expect(viewport).not.toHaveBeenCalled();
  s.resize();s.flush();expect(height).toHaveBeenCalledOnce();expect(viewport).toHaveBeenCalledOnce();s.cleanup();
 });
});
