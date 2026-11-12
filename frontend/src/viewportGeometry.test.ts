import {describe,expect,it} from 'vitest';
import {viewportFrame,viewportLayout,type ViewportLayout,type ViewportSample} from './viewportGeometry';

const portrait:ViewportLayout={height:844,width:390,frozen:false};
const sample=(height:number,overrides:Partial<ViewportSample>={}):ViewportSample=>({height,width:390,layoutHeight:844,focused:true,settled:false,...overrides});

describe('viewport layout during an iPhone keyboard transition',()=>{
 it('freezes before opening and keeps the page height through all animation frames',()=>{
  let layout=portrait;
  for(const height of [844,820,760,620,510]){
   layout=viewportLayout(layout,sample(height));
   expect(layout).toEqual({...portrait,frozen:true});
  }
 });

 it('does not shrink the layout on blur or release it midway through closing',()=>{
  let layout={...portrait,frozen:true};
  for(const height of [510,580,700,780,844]){
   layout=viewportLayout(layout,sample(height,{focused:false}));
   expect(layout.height).toBe(844);
   expect(layout.frozen).toBe(true);
  }
  expect(viewportLayout(layout,sample(844,{focused:false,settled:true}))).toEqual(portrait);
 });

 it('retains a hidden keyboard even after a quiet event interval',()=>{
  expect(viewportLayout({...portrait,frozen:true},sample(510,{focused:false,settled:true})))
   .toEqual({...portrait,frozen:true});
 });

 it('allows browser chrome to leave a small gap once closing has settled',()=>{
  expect(viewportLayout({...portrait,frozen:true},sample(780,{focused:false,settled:true})))
   .toEqual({height:780,width:390,frozen:false});
 });

 it('tracks ordinary browser bar resizing when no field is focused',()=>{
  const smaller=viewportLayout(portrait,sample(780,{focused:false}));
  expect(smaller).toEqual({height:780,width:390,frozen:false});
  expect(viewportLayout(smaller,sample(844,{focused:false}))).toEqual(portrait);
 });

 it('does not cap a visible area that grows while focus is retained',()=>{
  expect(viewportLayout({height:780,width:390,frozen:true},sample(844)))
   .toEqual({...portrait,frozen:true});
 });

 it('re-bases the layout to the new orientation while the keyboard is open',()=>{
  expect(viewportLayout({...portrait,frozen:true},sample(223,{width:844,layoutHeight:390})))
   .toEqual({height:390,width:844,frozen:true});
 });

 it('does not carry portrait height across an unfocused orientation change',()=>{
  expect(viewportLayout(portrait,sample(390,{width:844,layoutHeight:390,focused:false})))
   .toEqual({height:390,width:844,frozen:false});
 });
});

describe('visible keyboard geometry',()=>{
 it('does not resize the page or apply a second keyboard lift',()=>{
  const frame=viewportFrame(510,0,844);
  expect(frame).toEqual({height:844,top:0,visibleHeight:510,inset:334});
  expect(frame.height+frame.top-frame.inset).toBe(frame.top+frame.visibleHeight);
 });

 it('keeps the keyboard inset unchanged when Safari pans the viewport',()=>{
  const before=viewportFrame(510,0,844),panned=viewportFrame(510,80,844);
  expect(panned.inset).toBe(before.inset);
  expect(panned.height).toBe(before.height);
  expect(panned.height+panned.top-panned.inset).toBe(590);
 });

 it('bounds transient pan offsets and discards stale offsets after closing',()=>{
  expect(viewportFrame(510,900,844).top).toBe(334);
  expect(viewportFrame(510,-20,844).top).toBe(0);
  expect(viewportFrame(844,400,844)).toEqual({height:844,top:0,visibleHeight:844,inset:0});
 });

 it('never creates a negative inset when the visual viewport grows',()=>{
  expect(viewportFrame(844,25,780)).toEqual({height:844,top:0,visibleHeight:844,inset:0});
 });
});
