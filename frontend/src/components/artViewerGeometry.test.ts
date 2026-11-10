import {describe,it,expect} from 'vitest';
import {fitArtRect,artViewerTransform} from './artViewerGeometry';
describe('fullscreen art placement',()=>{
 it('fits a portrait inside a desktop without stretching',()=>{
  expect(fitArtRect({x:16,y:16,width:1168,height:768},.5)).toEqual({x:408,y:16,width:384,height:768});
 });
 it('fits a landscape inside a phone without cropping',()=>{
  expect(fitArtRect({x:16,y:16,width:358,height:812},2)).toEqual({x:16,y:332.5,width:358,height:179});
 });
 it('maps the fullscreen picture back to its visible source on closing',()=>{
  const source={x:100,y:200,width:200,height:400},destination={x:400,y:20,width:380,height:760};
  const t=artViewerTransform(source,destination,{x:0,y:0,width:1200,height:800});
  expect(destination.x+destination.width/2+t.x).toBe(source.x+source.width/2);
  expect(destination.y+destination.height/2+t.y).toBe(source.y+source.height/2);
  expect(destination.width*t.scaleX).toBeCloseTo(source.width);
  expect(destination.height*t.scaleY).toBeCloseTo(source.height);
 });
 it('uses a short fade when the original panel is off-screen',()=>{
  expect(artViewerTransform({x:-600,y:100,width:200,height:400},{x:400,y:20,width:380,height:760},{x:0,y:0,width:1200,height:800})).toEqual({x:0,y:12,scaleX:.96,scaleY:.96});
 });
});
