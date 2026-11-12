import {describe,it,expect} from 'vitest';
import {statsScrollPosition} from './statsScroll';
describe('mobile statistics scroll anchoring',()=>{
 const base={mode:'bottom' as const,top:500,max:520,gap:0,overflow:0,delta:20,remaining:0};
 it('follows each height increment while opening at the bottom',()=>expect(statsScrollPosition(base).top).toBe(520));
 it('follows each height decrement while closing',()=>expect(statsScrollPosition({...base,top:520,max:500,delta:-20}).top).toBe(500));
 it('preserves the starting distance from the bottom',()=>expect(statsScrollPosition({...base,gap:30}).top).toBe(490));
 it('reveals only the part extending below the viewport',()=>expect(statsScrollPosition({...base,mode:'reveal',top:300,overflow:12}).top).toBe(312));
 it('does not shift already-visible statistics',()=>expect(statsScrollPosition({...base,mode:'reveal',top:300,overflow:-50}).top).toBe(300));
 it('returns the reveal offset gradually while closing',()=>expect(statsScrollPosition({...base,mode:'restore',top:340,remaining:40,delta:-15})).toEqual({top:325,remaining:25}));
 it('does not overshoot the original position',()=>expect(statsScrollPosition({...base,mode:'restore',top:325,remaining:25,delta:-90})).toEqual({top:300,remaining:0}));
});
