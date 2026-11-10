import {expect,it} from 'vitest';
import {isSidebarSwipe,sidebarDragOffset,shouldFinishSidebarDrag,shouldDismissSheet} from './gestures';
it('accepts intentional directional swipes, including quick short flicks',()=>{
 expect(isSidebarSwipe(90,6,400,true)).toBe(true);
 expect(isSidebarSwipe(-90,6,400,false)).toBe(true);
 expect(isSidebarSwipe(40,3,60,true)).toBe(true);
});
it('keeps the drawer attached to the finger and clamps both ends',()=>{
 expect(sidebarDragOffset(-300,90,300)).toBe(-210);
 expect(sidebarDragOffset(0,-90,300)).toBe(-90);
 expect(sidebarDragOffset(-300,800,300)).toBe(0);
 expect(sidebarDragOffset(0,-800,300)).toBe(-300);
 expect(sidebarDragOffset(-70,35,300)).toBe(-35);
});
it('commits deliberate opening and closing distances or a recent quick flick',()=>{
 expect(shouldFinishSidebarDrag(-210,300,90,.1,true)).toBe(true);
 expect(shouldFinishSidebarDrag(-90,300,90,.1,false)).toBe(true);
 expect(shouldFinishSidebarDrag(-270,300,30,.65,true)).toBe(true);
 expect(shouldFinishSidebarDrag(-30,300,30,.65,false)).toBe(true);
});
it('returns short drags, paused flicks and reversed flicks to the starting state',()=>{
 expect(shouldFinishSidebarDrag(-270,300,30,0,true)).toBe(false);
 expect(shouldFinishSidebarDrag(-30,300,30,0,false)).toBe(false);
 expect(shouldFinishSidebarDrag(-20,300,20,1,false)).toBe(false);
 expect(shouldFinishSidebarDrag(-30,300,30,-.7,false)).toBe(false);
 expect(shouldFinishSidebarDrag(-90,300,210,-.7,true)).toBe(false);
 expect(shouldFinishSidebarDrag(-210,300,210,-.7,false)).toBe(false);
});
it('rejects taps, vertical scrolling, wrong directions and short slow drags',()=>{
 for(const [x,y,t,open] of [[4,0,20,true],[95,160,250,true],[-90,0,200,true],[30,0,400,true],[40,0,400,true],[90,0,200,false]] as const)expect(isSidebarSwipe(x,y,t,open)).toBe(false);
});

it('dismisses a sheet only after a deliberate downward header drag',()=>{
 expect(shouldDismissSheet(4,600,1)).toBe(false);
 expect(shouldDismissSheet(30,600,0)).toBe(false);
 expect(shouldDismissSheet(80,300,0)).toBe(true);
 expect(shouldDismissSheet(125,700,0)).toBe(true);
 expect(shouldDismissSheet(35,700,.7)).toBe(true);
 expect(shouldDismissSheet(35,700,-.7)).toBe(false);
});
