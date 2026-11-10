import {afterEach,describe,expect,it,vi} from 'vitest';
import {installIOSKeyboardFocusGuard,isIOSWebKit} from './iosKeyboardFocus';

const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1';
function harness(userAgent=iphone,isolated=false){
 const styles=new Map<string,[string,string]>(),frames=new Map<number,FrameRequestCallback>();let next=0;
 const handlers=new Map<string,(event:TouchEvent)=>void>();let active:unknown=null,opacityAtFocus='';
 class Field{
  disabled=false;readOnly=false;inDock=true;isConnected=true;
  style={getPropertyValue:(key:string)=>styles.get(key)?.[0]||'',getPropertyPriority:(key:string)=>styles.get(key)?.[1]||'',setProperty:(key:string,value:string,priority='')=>{styles.set(key,[value,priority])},removeProperty:(key:string)=>{styles.delete(key)}};
  closest(){return this.inDock?{}:null}
  focus=vi.fn(()=>{opacityAtFocus=this.style.getPropertyValue('opacity');active=this});
 }
 // The iframe's native control is not an instance of the parent's constructor.
 vi.stubGlobal('HTMLTextAreaElement',isolated?class ParentField{}:Field);
 const field=new Field();
 const doc={get activeElement(){return active},addEventListener:vi.fn((name:string,listener:(event:TouchEvent)=>void)=>{handlers.set(name,listener)}),removeEventListener:vi.fn((name:string)=>{handlers.delete(name)})};
 const win={navigator:{userAgent,platform:'iPhone',maxTouchPoints:5},visualViewport:{scale:1},requestAnimationFrame:(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next},cancelAnimationFrame:(id:number)=>{frames.delete(id)}};
 if(isolated)field.inDock=false;
 const remove=installIOSKeyboardFocusGuard(doc as unknown as Document,win as unknown as Window,isolated?field as unknown as HTMLTextAreaElement:undefined);
 const point={identifier:1,clientX:20,clientY:20};
 const emit=(name:string,overrides={})=>handlers.get(name)?.({target:field,defaultPrevented:false,cancelable:true,preventDefault:vi.fn(),timeStamp:name==='touchstart'?0:100,changedTouches:[point],touches:name==='touchend'?[]:[point],...overrides} as unknown as TouchEvent);
 return {field,doc,win,remove,styles,frames,emit,point,get opacityAtFocus(){return opacityAtFocus},tap:(overrides={})=>{emit('touchstart');emit('touchend',overrides)},paint:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(0))}};
}
afterEach(()=>vi.unstubAllGlobals());

describe('iOS bottom dock focus',()=>{
 it('guards the exact isolated field across the iframe boundary without a composer ancestor',()=>{
  const h=harness(iphone,true),preventDefault=vi.fn();h.tap({preventDefault});
  expect(h.opacityAtFocus).toBe('0');expect(h.field.focus).toHaveBeenCalledWith({preventScroll:true});expect(preventDefault).toHaveBeenCalledOnce();
  h.paint();expect(h.field.style.getPropertyValue('opacity')).toBe('');h.tap();expect(h.field.focus).toHaveBeenCalledOnce();
 });
 it('does not redirect touches on another target to the isolated field',()=>{
  const h=harness(iphone,true);h.emit('touchstart',{target:{}});h.emit('touchend');expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('uses the parent viewport to preserve pinch zoom in an isolated editor',()=>{
  const h=harness(iphone,true);h.win.visualViewport.scale=1.5;h.tap();expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('opens in the touch gesture without allowing a focus scroll, restoring the field on the next paint',()=>{
  const h=harness();h.tap();
  expect(h.opacityAtFocus).toBe('0');expect(h.field.focus).toHaveBeenCalledWith({preventScroll:true});
  h.paint();expect(h.field.style.getPropertyValue('opacity')).toBe('');expect(h.frames.size).toBe(0);
 });
 it('preserves an existing opacity and its priority',()=>{
  const h=harness();h.field.style.setProperty('opacity','.8','important');h.tap();h.paint();
  expect(h.styles.get('opacity')).toEqual(['.8','important']);
 });
 it('leaves selection and repeated taps in an already focused textarea to Safari',()=>{
  const h=harness();h.tap();h.paint();h.tap();expect(h.field.focus).toHaveBeenCalledTimes(1);expect(h.frames.size).toBe(0);
 });
 it('does not intercept forms outside bottom docks, readonly or disabled fields',()=>{
  const h=harness();h.field.inDock=false;h.tap();h.field.inDock=true;h.field.readOnly=true;h.tap();h.field.readOnly=false;h.field.disabled=true;h.tap();
  expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('leaves cancelled gestures, multi-touch and pinch zoom alone',()=>{
  const h=harness();h.tap({defaultPrevented:true});h.tap({changedTouches:[{},{}]});h.tap({touches:[{}]});h.win.visualViewport.scale=1.5;h.tap();
  expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('never focuses after a swipe even if the finger returns to its starting point',()=>{
  const h=harness();h.emit('touchstart');h.emit('touchmove',{touches:[{...h.point,clientY:45}]});h.emit('touchmove');h.emit('touchend');
  expect(h.field.focus).not.toHaveBeenCalled();expect(h.frames.size).toBe(0);
 });
 it('leaves long presses, native scrolling and cancelled pointers to Safari',()=>{
  const h=harness();h.tap({timeStamp:600});
  for(const name of ['touchcancel','pointercancel','scroll']){h.emit('touchstart');h.emit(name);h.emit('touchend')}
  h.emit('touchend');expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('rejects unmatched touches, detached fields and movement seen only at release',()=>{
  const h=harness();h.tap({changedTouches:[{...h.point,identifier:2}]});h.tap({changedTouches:[{...h.point,clientX:40}]});h.field.isConnected=false;h.tap();expect(h.field.focus).not.toHaveBeenCalled();
 });
 it('allows small finger jitter and cleans up every listener',()=>{
  const h=harness();h.emit('touchstart');h.emit('touchmove',{touches:[{...h.point,clientY:24}]});h.emit('touchend');expect(h.field.focus).toHaveBeenCalledTimes(1);h.remove();expect(h.doc.removeEventListener).toHaveBeenCalledTimes(6);
 });
 it('restores a pending field and removes listeners when the mobile layout unmounts',()=>{
  const h=harness();h.tap();h.remove();expect(h.frames.size).toBe(0);expect(h.field.style.getPropertyValue('opacity')).toBe('');expect(h.doc.removeEventListener).toHaveBeenCalled();
 });
 it('does not install the workaround in desktop browsers',()=>{
  const h=harness('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/142.0');h.tap();expect(h.doc.addEventListener).not.toHaveBeenCalled();
 });
 it('recognises iPad desktop mode without mistaking a Mac or Android for iOS',()=>{
  expect(isIOSWebKit('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15','MacIntel',5)).toBe(true);
  expect(isIOSWebKit('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15','MacIntel',0)).toBe(false);
  expect(isIOSWebKit('Mozilla/5.0 (Linux; Android) AppleWebKit/537.36','Linux',5)).toBe(false);
 });
});
