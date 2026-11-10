import {describe,it,expect} from 'vitest';
import {resizeStudioRect,zoomStudioAt,type ResizeSide} from './studioGeometry';
describe('studio workspace geometry',()=>{
 const rect={x:100,y:80,width:400,height:500};
 it.each(['n','s','e','w','ne','nw','se','sw'] as ResizeSide[])('resizes from %s while preserving the opposite edge',side=>{
  const next=resizeStudioRect(rect,side,40,60,260);
  expect(next.width).toBe(side.includes('e')?440:side.includes('w')?360:400);
  expect(next.height).toBe(side.includes('s')?560:side.includes('n')?440:500);
  if(side.includes('w'))expect(next.x+next.width).toBe(rect.x+rect.width);
  if(side.includes('n'))expect(next.y+next.height).toBe(rect.y+rect.height);
 });
 it('keeps the opposite corner fixed at minimum size',()=>{
  const next=resizeStudioRect(rect,'nw',1000,1000,260);
  expect(next).toEqual({x:220,y:320,width:280,height:260});
 });
 it('anchors the same world point beneath the cursor during zoom',()=>{
  const view={zoom:.7,panX:80,panY:-40},next=zoomStudioAt(view,1.3,250,180);
  expect((250-next.panX)/next.zoom).toBeCloseTo((250-view.panX)/view.zoom);
  expect((180-next.panY)/next.zoom).toBeCloseTo((180-view.panY)/view.zoom);
 });
 it('clamps camera scale using the actual resulting zoom',()=>{
  expect(zoomStudioAt({zoom:1,panX:0,panY:0},10,100,100)).toEqual({zoom:2,panX:-100,panY:-100});
 });
});
