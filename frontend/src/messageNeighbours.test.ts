import {expect,it} from 'vitest';
import {messageNeighbours} from './messageNeighbours';
import type {Message} from './types';
const rows=(...roles:Message['role'][])=>roles.map((role,i)=>({id:String(i),timestamp:i,role,content:''}));
it('preserves dividers and the final margin while ignoring non-rendered system rows',()=>{
 const result=messageNeighbours(rows('user','assistant','system','user','assistant','system'));
 expect(result[1]).toEqual({nextUser:true,last:false});
 expect(result[3]).toEqual({nextUser:false,last:false});
 expect(result[4]).toEqual({nextUser:false,last:true});
});
it('moves the final-margin marker to an appended live reply, not a regenerated saved row',()=>{
 expect(messageNeighbours(rows('user','assistant'),true)[1].last).toBe(false);
 expect(messageNeighbours(rows('user','assistant'),false)[1].last).toBe(true);
 expect(messageNeighbours([])).toEqual([]);
});
