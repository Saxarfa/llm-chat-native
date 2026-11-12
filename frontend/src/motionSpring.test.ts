import {afterEach,describe,expect,it,vi} from 'vitest';
import {summarizeFrames} from './motionProbe';

async function load(linear:boolean){
 vi.resetModules();
 vi.stubGlobal('CSS',{supports:()=>linear});
 return import('./motionSpring');
}
afterEach(()=>vi.unstubAllGlobals());

describe('velocity-aware spring settle',()=>{
 it('is monotonic, never passes the target and ends exactly on it',async()=>{
  const {solveSpringSettle}=await load(true);
  for(const velocity of [0,.2,1,3,8]){
   const spring=solveSpringSettle(400,velocity,34);
   let previous=0;
   for(let ms=0;ms<=spring.duration;ms+=2){
    const value=spring.progressAt(ms);
    expect(value).toBeGreaterThanOrEqual(previous-1e-9);
    expect(value).toBeLessThanOrEqual(1);
    previous=value;
   }
   expect(spring.progressAt(spring.duration)).toBe(1);
  }
 });
 it('a faster release finishes sooner and starts at the finger speed',async()=>{
  const {solveSpringSettle}=await load(true);
  const rest=solveSpringSettle(300,0,34),flick=solveSpringSettle(300,2,34);
  expect(flick.duration).toBeLessThan(rest.duration);
  // Continuity: the first few milliseconds move at roughly the release speed.
  const slope=flick.progressAt(1)*300;
  expect(slope).toBeGreaterThan(1.8);expect(slope).toBeLessThan(2.5);
  expect(rest.progressAt(1)*300).toBeLessThan(.3);
 });
 it('treats opposing, missing or invalid speed as a start from rest',async()=>{
  const {solveSpringSettle}=await load(true);
  const rest=solveSpringSettle(300,0,34);
  for(const velocity of [-2,NaN,Infinity*0])expect(solveSpringSettle(300,velocity,34).duration).toBe(rest.duration);
 });
 it('settles tiny and zero distances quickly without dividing by zero',async()=>{
  const {solveSpringSettle}=await load(true);
  for(const distance of [0,.3,2]){
   const spring=solveSpringSettle(distance,0,34);
   expect(spring.duration).toBeLessThanOrEqual(120);
   expect(Number.isFinite(spring.progressAt(spring.duration/2))).toBe(true);
  }
 });
 it('emits a bounded linear() easing, or the earlier curve where it is unsupported',async()=>{
  const supported=await load(true),spring=supported.solveSpringSettle(400,1,34);
  expect(spring.easing.startsWith('linear(0,')).toBe(true);
  expect(spring.easing.endsWith(',1)')).toBe(true);
  expect(spring.easing.split(',').length).toBeLessThanOrEqual(102);
  const legacy=await load(false);
  expect(legacy.supportsLinearEasing()).toBe(false);
  expect(legacy.solveSpringSettle(400,1,34).easing).toContain('cubic-bezier');
 });
});

describe('frame probe summary',()=>{
 it('ignores too-short runs and counts only gaps well above the normal cadence',()=>{
  expect(summarizeFrames([0,8,16])).toBeNull();
  const steady=Array.from({length:30},(_,i)=>i*8.33);
  expect(summarizeFrames(steady)?.jank).toBe(0);
  const hitch=[...steady.slice(0,15),...steady.slice(15).map(value=>value+40)];
  const result=summarizeFrames(hitch)!;
  expect(result.jank).toBe(1);expect(result.max).toBeGreaterThan(40);expect(result.count).toBe(30);
 });
});
