import {expect,it} from 'vitest';
import {boundedScrollTop,resumeChatFollowing} from './chatScrollFollow';

it('keeps reading mode after a final answer layout change reaches the bottom',()=>{
 expect(resumeChatFollowing(false,true,0,600,550,0,1000)).toBe(false);
 expect(resumeChatFollowing(false,true,0,600,550,900,1000)).toBe(false);
});
it('allows a deliberate downward gesture to resume at the bottom, including inertia',()=>{
 expect(resumeChatFollowing(false,true,0,600,550,2000,1000)).toBe(true);
 expect(resumeChatFollowing(false,true,200,400,350,2000,1000)).toBe(false);
 expect(resumeChatFollowing(false,true,0,599,600,2000,1000)).toBe(false);
 expect(resumeChatFollowing(true,true,0,600,600,0,1000)).toBe(true);
});
it('clamps iOS rubber-band offsets so their rebound does not look like scrolling down',()=>{
 expect(boundedScrollTop(-80,1000,400)).toBe(0);
 expect(boundedScrollTop(680,1000,400)).toBe(600);
 expect(boundedScrollTop(40,200,400)).toBe(0);
 expect(resumeChatFollowing(false,true,600,boundedScrollTop(0,1000,400),boundedScrollTop(-80,1000,400),0,1000)).toBe(false);
});
