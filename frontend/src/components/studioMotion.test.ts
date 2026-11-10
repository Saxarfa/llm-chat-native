import {afterEach,expect,it,vi} from 'vitest';
import {StudioMotion,studioDefaults,paintStudioLayout,restoreStudioLayout} from './studioMotion';
import {zoomStudioAt} from './studioGeometry';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
it('keeps existing window positions when adding the translator to a saved two-window workspace',()=>{
 const old=Object.fromEntries(Object.entries({...studioDefaults,x:123,artX:700,artY:90,artWidth:500,zoom:.8}).filter(([key])=>!key.startsWith('translator')));
 const restored=restoreStudioLayout(old);
 expect(restored?.complete).toBe(false);
 expect(restored?.layout).toMatchObject({x:123,artX:700,artY:90,artWidth:500,zoom:.8,translatorX:1224,translatorY:90});
 expect(restoreStudioLayout(restored?.layout)?.complete).toBe(true);
 expect(restoreStudioLayout({...old,artWidth:'bad'})).toBeNull();
});
it('paints translator movement without repainting the camera or other windows',()=>{
 const make=()=>({style:{} as Record<string,string>,textContent:''}),workspace=make(),form=make(),art=make(),zoom=make(),translator=make();
 const draw=(v=studioDefaults)=>paintStudioLayout(v,workspace as unknown as HTMLElement,form as unknown as HTMLElement,art as unknown as HTMLElement,zoom as unknown as HTMLElement,translator as unknown as HTMLElement);
 draw();const before={workspace:{...workspace.style},form:{...form.style},art:{...art.style}};
 draw({...studioDefaults,translatorX:1300,translatorWidth:450});
 expect(translator.style.transform).toBe('translate(1300px, 24px)');expect(translator.style.width).toBe('450px');
 expect(workspace.style).toEqual(before.workspace);expect(form.style).toEqual(before.form);expect(art.style).toEqual(before.art);
});
function setup(){
 vi.useFakeTimers();let next=0;const frames=new Map<number,FrameRequestCallback>();
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++next,fn);return next});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 const paint=vi.fn(),commit=vi.fn(),motion=new StudioMotion({...studioDefaults},paint,commit);
 const frame=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(0))};
 return {motion,paint,commit,frame,frames};
}
it('paints the latest coordinates once per display frame without publishing every pointer event',()=>{
 const {motion,paint,commit,frame,frames}=setup();
 for(let x=1;x<=180;x++)motion.update(v=>({...v,panX:x,panY:-x}));
 expect(frames.size).toBe(1);expect(paint).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
 frame();expect(paint).toHaveBeenCalledOnce();expect(paint.mock.calls[0][0]).toMatchObject({panX:180,panY:-180});
 motion.flush();expect(commit).toHaveBeenCalledOnce();expect(commit.mock.calls[0][0]).toBe(motion.current);
});
it('composes consecutive wheel deltas against the latest camera and commits after settling',()=>{
 const {motion,commit,frame}=setup();
 for(let i=0;i<60;i++){
  motion.update(v=>({...v,...zoomStudioAt(v,v.zoom*1.005,120,180)}));frame();vi.advanceTimersByTime(5);
 }
 expect(commit).not.toHaveBeenCalled();
 const v=motion.current;expect((120-v.panX)/v.zoom).toBeCloseTo(120);expect((180-v.panY)/v.zoom).toBeCloseTo(180);
 vi.advanceTimersByTime(180);expect(commit).toHaveBeenCalledOnce();
});
it('flushes the final movement on release and cancels delayed work on disposal',()=>{
 const {motion,paint,commit,frame}=setup();
 motion.update(v=>({...v,x:500,width:600}));motion.flush();frame();vi.advanceTimersByTime(1000);
 expect(paint).toHaveBeenCalledOnce();expect(commit).toHaveBeenCalledOnce();
 motion.update(v=>({...v,x:700}));motion.dispose();frame();vi.advanceTimersByTime(1000);
 expect(paint).toHaveBeenCalledOnce();expect(commit).toHaveBeenCalledOnce();
});
it('updates local transforms and sizes without inherited variables or rewriting unchanged dimensions',()=>{
 const writes:string[]=[],element=()=>({style:new Proxy({} as Record<string,string>,{set:(target,name:string,value:string)=>{writes.push(name);target[name]=value;return true}}),textContent:''});
 const workspace=element(),form=element(),art=element(),zoom=element();
 const draw=(v=studioDefaults)=>paintStudioLayout(v,workspace as unknown as HTMLElement,form as unknown as HTMLElement,art as unknown as HTMLElement,zoom as unknown as HTMLElement);
 draw();writes.length=0;draw({...studioDefaults,panX:120,panY:80,zoom:.75});
 expect(writes).toEqual(['transform']);expect(zoom.textContent).toBe('75%');
 writes.length=0;draw({...studioDefaults,panX:120,panY:80,zoom:.75});expect(writes).toEqual([]);
});
