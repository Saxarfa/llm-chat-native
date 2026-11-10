import {afterEach,expect,it,vi} from 'vitest';
import {moveModel,readModelPickerPreferences} from './modelPickerPreferences';
afterEach(()=>vi.unstubAllGlobals());
it('restores the last source and order, rejecting obsolete API tabs and corrupt storage',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({category:'studio',order:['b','a','b',2]})});
 expect(readModelPickerPreferences('user1','local')).toEqual({category:'studio',order:['b','a']});
 vi.stubGlobal('localStorage',{getItem:()=>'{'});
 expect(readModelPickerPreferences('user2','subscription')).toEqual({category:'subscription',order:[]});
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({category:'api'})});
 expect(readModelPickerPreferences('user1','local').category).toBe('local');
});
it('moves rows in both directions and retains models outside the current results',()=>{
 expect(moveModel(['other','a','b','c'],['a','b','c'],'a','c')).toEqual(['other','b','c','a']);
 expect(moveModel(['other','a','b','c'],['a','b','c'],'c','a')).toEqual(['other','c','a','b']);
 const order=['a','b'];expect(moveModel(order,['a','b'],'outside','a')).toBe(order);
});
