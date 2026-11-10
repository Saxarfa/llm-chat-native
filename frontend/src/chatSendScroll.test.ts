import {afterEach,describe,expect,it,vi} from 'vitest';
import {animateChatSendScroll} from './chatSendScroll';

function screen(reduced=false,interruptMomentum=false){
 const frames=new Map<number,FrameRequestCallback>();let next=0,changing=false,resize=()=>{};
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),disconnect=vi.fn();
 vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resize=callback}observe(){}disconnect=disconnect});
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 const values=new Map([['overflow-y',{value:'auto',priority:'important'}],['scroll-behavior',{value:'smooth',priority:''}]]);
 const style={getPropertyValue:(name:string)=>values.get(name)?.value||'',getPropertyPriority:(name:string)=>values.get(name)?.priority||'',setProperty:(name:string,value:string,priority='')=>{values.set(name,{value,priority})},removeProperty:(name:string)=>{values.delete(name)}};
 const area={style,scrollHeight:2000,clientHeight:800,scrollTop:900,querySelector:()=>null,scrollTo:vi.fn(({top}:{top:number})=>{area.scrollTop=Math.min(area.scrollHeight-area.clientHeight,top)})};
 const done=vi.fn(),progress=vi.fn();
 const cancel=animateChatSendScroll(area as unknown as HTMLElement,{from:900,duration:240,reduced,interruptMomentum,viewportChanging:()=>changing,onProgress:progress,onComplete:done});
 return {area,frames,done,progress,cancel,disconnect,resize:()=>resize(),viewport:(value:boolean)=>{changing=value},paint:(now:number)=>{clock.mockReturnValue(now);const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now))}};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
describe('sending through keyboard dismissal',()=>{
 it('restores native scrolling and the exact inline priorities after an explicit jump finishes or is interrupted',()=>{
  for(const cancel of [false,true]){
   const s=screen(false,true);
   expect(s.area.style.getPropertyValue('overflow-y')).toBe('hidden');
   expect(s.area.style.getPropertyValue('scroll-behavior')).toBe('auto');
   s.paint(80);if(cancel)s.cancel();else s.paint(240);
   expect(s.area.style.getPropertyValue('overflow-y')).toBe('auto');
   expect(s.area.style.getPropertyPriority('overflow-y')).toBe('important');
   expect(s.area.style.getPropertyValue('scroll-behavior')).toBe('smooth');
   if(cancel){s.area.scrollTop=200;s.paint(500);expect(s.area.scrollTop).toBe(200);expect(s.done).not.toHaveBeenCalled()}
  }
 });
 it('starts at the captured reading position and follows the current bottom without restarting the animation',()=>{
  const s=screen();s.paint(0);expect(s.area.scrollTop).toBe(900);
  s.paint(120);expect(s.area.scrollTop).toBeCloseTo(1162.5);
  // Keyboard clearance contracts as the keyboard closes; the position is held
  // at the new bottom instead of being pulled back by the whole change.
  s.area.scrollHeight-=200;s.paint(120);expect(s.area.scrollTop).toBe(1000);
  s.paint(240);expect(s.area.scrollTop).toBe(1000);expect(s.done).toHaveBeenCalledOnce();expect(s.frames.size).toBe(0);
  expect(s.area.scrollTo.mock.calls.every(([options])=>(options as {behavior?:string}).behavior==='instant')).toBe(true);
 });
 it('retains ownership past the send duration until the keyboard settles, including reduced motion',()=>{
  for(const reduced of [false,true]){
   const s=screen(reduced);s.viewport(true);s.paint(240);expect(s.done).not.toHaveBeenCalled();
   s.area.scrollHeight-=180;s.paint(400);expect(s.area.scrollTop).toBe(1020);
   s.viewport(false);s.paint(480);expect(s.done).toHaveBeenCalledOnce();expect(s.frames.size).toBe(0);
  }
 });
 it('does not resume following after a manual gesture cancels the send',()=>{
  const s=screen();s.viewport(true);s.paint(80);s.cancel();s.area.scrollTop=300;s.area.scrollHeight-=200;s.viewport(false);s.paint(500);
  s.resize();expect(s.area.scrollTop).toBe(300);expect(s.frames.size).toBe(0);expect(s.done).not.toHaveBeenCalled();expect(s.disconnect).toHaveBeenCalledOnce();
 });
 it('reconciles a keyboard/composer layout committed after rAF in the same paint',()=>{
  const s=screen();s.paint(120);s.area.scrollHeight-=200;s.resize();expect(s.area.scrollTop).toBe(1000);
  s.area.scrollHeight+=400;s.resize();expect(s.area.scrollTop).toBeCloseTo(1337.5);
  s.paint(240);expect(s.disconnect).toHaveBeenCalledOnce();
 });
 it('never steps back up when the range shrinks a little early in the send',()=>{
  // Desktop send: the new row lands, then the composer clearance shrinks by
  // 48px a frame later. The list must keep moving down, not twitch back.
  const s=screen();s.area.scrollHeight=2400;s.paint(0);s.paint(30);const before=s.area.scrollTop;
  s.area.scrollHeight-=48;s.resize();expect(s.area.scrollTop).toBeGreaterThanOrEqual(before);
  s.paint(60);expect(s.area.scrollTop).toBeGreaterThan(before);
  s.paint(240);expect(s.area.scrollTop).toBe(s.area.scrollHeight-s.area.clientHeight);
 });
 it('uses the pre-send position when DOM updates have already clamped scrollTop',()=>{
  const s=screen();s.area.scrollTop=1200;s.paint(0);expect(s.area.scrollTop).toBe(900);s.cancel();
 });
});
