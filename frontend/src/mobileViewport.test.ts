import {afterEach,describe,expect,it,vi} from 'vitest';
const effect=vi.hoisted(()=>({cleanup:undefined as undefined|(()=>void)}));
vi.mock('react',()=>({useLayoutEffect:(run:()=>undefined|(()=>void))=>{effect.cleanup=run()}}));
vi.mock('./iosKeyboardFocus',()=>({installIOSKeyboardFocusGuard:()=>()=>{}}));
import {KEYBOARD_MOTION_MS,KEYBOARD_WINDOW_MS,useMobileViewport} from './mobileViewport';

function screen(saved:Record<string,string>={}){
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
 const memory=new Map(Object.entries(saved));
 vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)});
 const frames=new Map<number,FrameRequestCallback>(),values=new Map<string,string>();let next=0;
 class Field{isContentEditable=false;matches(){return true}}
 vi.stubGlobal('HTMLElement',Field);
 const viewport=Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1});
 const root={style:{getPropertyValue:(name:string)=>values.get(name)||'',setProperty:(name:string,value:string)=>{values.set(name,value)},removeProperty:(name:string)=>{values.delete(name)}},dataset:{} as Record<string,string>,clientHeight:844};
 const doc=Object.assign(new EventTarget(),{documentElement:root,activeElement:null as Field|null,querySelector:()=>null});
 const win=Object.assign(new EventTarget(),{visualViewport:viewport});
 vi.stubGlobal('window',win);vi.stubGlobal('document',doc);vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++next,cb);return next});vi.stubGlobal('cancelAnimationFrame',(id:number)=>{frames.delete(id)});
 useMobileViewport(true);
 return {viewport,root,doc,win,values,frames,memory,focus:()=>{doc.activeElement=new Field();doc.dispatchEvent(new Event('focusin'))},resize:(height:number)=>{viewport.height=height;viewport.dispatchEvent(new Event('resize'))},paint:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(0))}};
}
afterEach(()=>{effect.cleanup?.();effect.cleanup=undefined;vi.useRealTimers();vi.unstubAllGlobals()});
describe('keyboard viewport synchronisation',()=>{
 it('moves the dock in the same resize event while keeping the conversation height fixed',()=>{
  const s=screen();s.focus();s.resize(510);
  expect(s.values.get('--app-height')).toBe('844px');expect(s.values.get('--visible-height')).toBe('510px');expect(s.values.get('--keyboard-inset')).toBe('334px');
  expect(s.root.dataset.viewportResizing).toBe('true');
  expect(s.values.get('--keyboard-motion-duration')).toBe(`${KEYBOARD_MOTION_MS}ms`);
 });
 it('follows dense native keyboard samples directly instead of stacking CSS lag',()=>{
  const s=screen();s.focus();
  for(const height of [820,796,772,748,724]){s.resize(height);expect(s.values.get('--keyboard-motion-duration')).toBe('0ms');expect(s.values.get('--keyboard-inset')).toBe(`${844-height}px`)}
 });
 it('compensates Safari pan changes between browser notifications on the next paint',()=>{
  const s=screen();s.focus();s.resize(510);s.viewport.offsetTop=80;s.paint();
  expect(s.values.get('--viewport-top')).toBe('80px');expect(s.values.get('--app-height')).toBe('844px');
 });
 it('drops the dock with the keyboard on editor blur instead of waiting for late Safari samples',()=>{
  const s=screen();s.focus();s.resize(510);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  expect(s.values.get('--keyboard-inset')).toBe('334px');
  s.doc.activeElement=null;s.win.dispatchEvent(new Event('composer-blur'));
  // Safari has not reported anything yet; the dock already leaves, on the iOS keyboard timing.
  expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.values.get('--keyboard-motion-duration')).toBe(`${KEYBOARD_MOTION_MS}ms`);
  expect(s.root.dataset.viewportResizing).toBe('true');expect(s.root.dataset.keyboard).toBe('false');
  // A stale, still-open sample does not lift it back up.
  s.resize(600);expect(s.values.get('--keyboard-inset')).toBe('0px');
  // Refocusing the editor cancels the anticipation at once.
  s.focus();s.resize(510);expect(s.values.get('--keyboard-inset')).toBe('334px');
 });
 it('does not anticipate a dismissal when no keyboard is open',()=>{
  const s=screen();s.win.dispatchEvent(new Event('composer-blur'));
  expect(s.values.get('--keyboard-motion-duration')).not.toBe(`${KEYBOARD_MOTION_MS}ms`);
 });
 it('reuses the measured keyboard height on focus before Safari reports the opening',()=>{
  const s=screen();s.focus();s.resize(510);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  expect(s.memory.get('saxara_keyboard_inset:390')).toBe('334');
  s.doc.activeElement=null;s.win.dispatchEvent(new Event('composer-blur'));s.resize(844);
  vi.advanceTimersByTime(KEYBOARD_WINDOW_MS);s.paint();
  s.focus();s.win.dispatchEvent(new Event('composer-focus'));
  expect(s.viewport.height).toBe(844);expect(s.values.get('--keyboard-inset')).toBe('334px');
  expect(s.values.get('--keyboard-motion-duration')).toBe(`${KEYBOARD_MOTION_MS}ms`);
  s.resize(800);expect(s.values.get('--keyboard-inset')).toBe('334px');
  s.resize(510);vi.advanceTimersByTime(KEYBOARD_WINDOW_MS);s.paint();
  expect(s.values.get('--keyboard-inset')).toBe('334px');expect(s.frames.size).toBe(0);
 });
 it('clears an anticipated inset if a hardware keyboard leaves the viewport full',()=>{
  const s=screen({'saxara_keyboard_inset:390':'334'});s.focus();s.win.dispatchEvent(new Event('composer-focus'));
  expect(s.values.get('--keyboard-inset')).toBe('334px');
  vi.advanceTimersByTime(KEYBOARD_WINDOW_MS);s.paint();
  expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.memory.has('saxara_keyboard_inset:390')).toBe(false);
  vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();expect(s.frames.size).toBe(0);
 });
 it('does not reuse a portrait keyboard height at a different screen width',()=>{
  const s=screen({'saxara_keyboard_inset:390':'334'});
  vi.stubGlobal('innerWidth',844);vi.stubGlobal('innerHeight',390);s.root.clientHeight=390;s.resize(390);
  s.focus();s.win.dispatchEvent(new Event('composer-focus'));
  expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.values.get('--app-height')).toBe('390px');
 });
 it('does not treat pinch zoom as a keyboard resize',()=>{
  const s=screen();s.viewport.scale=1.5;s.resize(510);s.paint();
  expect(s.values.get('--app-height')).toBe('844px');expect(s.values.get('--keyboard-inset')).toBe('0px');
 });
 it('stops polling after the transition settles without releasing a still visible keyboard',()=>{
  const s=screen();s.focus();s.resize(510);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  expect(s.frames.size).toBe(0);expect(s.root.dataset.viewportResizing).toBeUndefined();expect(s.values.get('--app-height')).toBe('844px');expect(s.root.dataset.keyboard).toBe('true');
 });
 it('restores the full viewport after blur and keyboard dismissal without a stale pan',()=>{
  const s=screen();s.focus();s.resize(510);s.viewport.offsetTop=80;s.paint();
  s.doc.activeElement=null;s.doc.dispatchEvent(new Event('focusout'));s.resize(844);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  expect(s.values.get('--viewport-top')).toBe('0px');expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.root.dataset.keyboard).toBe('false');expect(s.frames.size).toBe(0);
 });
 it('does not measure or rewrite the page on identical keyboard frames',()=>{
  const s=screen();s.focus();s.resize(510);
  const read=vi.spyOn(s.doc,'querySelector');
  for(let i=0;i<20;i++)s.paint();
  expect(read).not.toHaveBeenCalled();
  s.viewport.offsetTop=20;s.paint();expect(read).not.toHaveBeenCalled();expect(s.values.get('--viewport-top')).toBe('20px');
 });
 it('leaves composer height changes to the dock observer without restarting keyboard polling',()=>{
  const s=screen();s.focus();s.resize(510);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  const read=vi.spyOn(s.doc,'querySelector');
  s.win.dispatchEvent(new Event('composer-height-changed'));s.paint();
  expect(read).not.toHaveBeenCalled();expect(s.frames.size).toBe(0);
 });
 it('ignores duplicate Safari resize notifications after the keyboard settles',()=>{
  const s=screen();s.focus();s.resize(510);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  const read=vi.spyOn(s.doc,'querySelector');
  for(let i=0;i<10;i++){s.resize(510);s.win.dispatchEvent(new Event('resize'));s.viewport.dispatchEvent(new Event('scroll'))}
  expect(read).not.toHaveBeenCalled();expect(s.frames.size).toBe(0);expect(vi.getTimerCount()).toBe(0);expect(s.root.dataset.viewportResizing).toBeUndefined();
 });
 it('does not force a layout read for keyboard frames; only rotation reads the layout viewport',()=>{
  const s=screen(),layoutRead=vi.fn(()=>844);
  Object.defineProperty(s.root,'clientHeight',{get:layoutRead});
  s.focus();for(const height of [820,796,772,748,724]){s.resize(height);s.paint()}
  vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();expect(layoutRead).not.toHaveBeenCalled();
  vi.stubGlobal('innerWidth',844);s.win.dispatchEvent(new Event('resize'));
  expect(layoutRead).toHaveBeenCalledTimes(1);
 });
 it('recognises a focused editor in nested iframe documents through the explicit focus bridge',()=>{
  const s=screen(),editor={tagName:'TEXTAREA',isContentEditable:false,matches:()=>true};
  // A foreign realm has a different HTMLElement constructor.
  expect(editor instanceof HTMLElement).toBe(false);
  s.doc.activeElement={tagName:'IFRAME',contentDocument:{activeElement:{tagName:'IFRAME',contentDocument:{activeElement:editor}}}} as never;
  s.win.dispatchEvent(new Event('composer-focus'));s.resize(510);
  expect(s.values.get('--app-height')).toBe('844px');expect(s.values.get('--keyboard-inset')).toBe('334px');expect(s.root.dataset.keyboard).toBe('true');
 });
 it('handles a child editor blur bridge while the parent still has the iframe focused',()=>{
  const s=screen(),child={activeElement:{tagName:'TEXTAREA',isContentEditable:false,matches:()=>true} as object|null};
  s.doc.activeElement={tagName:'IFRAME',contentDocument:child} as never;s.win.dispatchEvent(new Event('composer-focus'));s.resize(510);
  vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();expect(s.root.dataset.viewportResizing).toBeUndefined();
  child.activeElement=null;s.win.dispatchEvent(new Event('composer-blur'));
  expect(s.root.dataset.viewportResizing).toBe('true');
  s.resize(844);vi.advanceTimersByTime(KEYBOARD_MOTION_MS+40);s.paint();
  expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.root.dataset.keyboard).toBe('false');expect(s.frames.size).toBe(0);
 });
 it('recognises editable content in a foreign document without parent realm instanceof checks',()=>{
  const s=screen();s.doc.activeElement={tagName:'IFRAME',contentDocument:{activeElement:{tagName:'DIV',isContentEditable:true,matches:()=>false}}} as never;
  s.win.dispatchEvent(new Event('composer-focus'));s.resize(510);
  expect(s.values.get('--app-height')).toBe('844px');expect(s.values.get('--keyboard-inset')).toBe('334px');
 });
 it.each([
  {name:'an unavailable frame document',frame:{tagName:'IFRAME',contentDocument:null}},
  {name:'a frame without an active element',frame:{tagName:'IFRAME',contentDocument:{activeElement:null}}},
  {name:'a frame with restricted document access',frame:{tagName:'IFRAME',get contentDocument(){throw new DOMException('Blocked','SecurityError')}}},
  {name:'a disabled or readonly editor',frame:{tagName:'IFRAME',contentDocument:{activeElement:{tagName:'TEXTAREA',isContentEditable:false,matches:()=>false}}}},
 ])('does not infer keyboard focus from $name',({frame})=>{
  const s=screen();s.doc.activeElement=frame as never;
  expect(()=>{s.win.dispatchEvent(new Event('composer-focus'));s.resize(510)}).not.toThrow();
  expect(s.values.get('--app-height')).toBe('510px');expect(s.values.get('--keyboard-inset')).toBe('0px');expect(s.root.dataset.keyboard).toBe('false');
 });
 it('cancels pending work and listeners when switching out of the mobile layout',()=>{
  const s=screen();s.focus();s.resize(510);effect.cleanup?.();effect.cleanup=undefined;
  vi.advanceTimersByTime(KEYBOARD_WINDOW_MS+KEYBOARD_MOTION_MS);s.resize(600);s.win.dispatchEvent(new Event('composer-focus'));s.win.dispatchEvent(new Event('composer-blur'));
  expect(s.frames.size).toBe(0);expect(s.values.size).toBe(0);expect(s.root.dataset.viewportResizing).toBeUndefined();
 });
});
