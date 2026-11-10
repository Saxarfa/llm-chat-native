import {describe,it,expect} from 'vitest';
import {groupChats} from './chatGroups';

describe('chat date groups',()=>{
 it('organizes folders after pins and returns chats to dates when a folder is removed',()=>{
  const chats=[{id:'a',updatedAt:3,pinned:true,folder_id:'f'},{id:'b',updatedAt:2,folder_id:'f'},{id:'c',updatedAt:1}];
  const groups=groupChats(chats,new Date(3),[{id:'f',name:'Работа'},{id:'empty',name:'Личное'}]);
  expect(groups[0].key).toBe('pinned');expect(groups[1].chats.map(c=>c.id)).toEqual(['b']);expect(groups[2].chats).toEqual([]);
  expect(groups.flatMap(g=>g.chats).map(c=>c.id)).toEqual(['a','b','c']);
  expect(groupChats(chats,new Date(3)).flatMap(g=>g.chats)).toHaveLength(3);
 });
 it('shows pinned chats first without duplication and returns unpinned chats to their date group',()=>{
  const now=new Date(2026,9,8,12),today=now.getTime();
  const chats=[{id:'today',updatedAt:today,pinned:false},{id:'old-pin',updatedAt:new Date(2025,1,1).getTime(),pinned:true},{id:'new-pin',updatedAt:today-1000,pinned:true}];
  const before=JSON.stringify(chats),groups=groupChats(chats,now);
  expect(groups.map(g=>g.label)).toEqual(['Закреплённые','8 октября, четверг']);
  expect(groups[0].chats.map(c=>c.id)).toEqual(['new-pin','old-pin']);
  expect(groups.flatMap(g=>g.chats)).toHaveLength(3);
  expect(JSON.stringify(chats)).toBe(before);
  const unpinned=groupChats(chats.map(c=>({...c,pinned:false})),now);
  expect(unpinned.map(g=>g.key)).not.toContain('pinned');
  expect(unpinned.at(-1)?.chats[0].id).toBe('old-pin');
 });
 it('splits calendar boundaries without duplicating or mutating chats',()=>{
  const now=new Date(2026,9,4,12),date=(month:number,day:number,hour=12)=>new Date(2026,month,day,hour).getTime();
  const chats=[{id:'older',updatedAt:date(8,27)},{id:'today',updatedAt:date(9,4,0)},{id:'week',updatedAt:date(8,28,0)},{id:'yesterday',updatedAt:date(9,3,0)},{id:'august',updatedAt:date(7,31)}];
  const before=JSON.stringify(chats),groups=groupChats(chats,now);
  expect(groups.map(g=>g.label)).toEqual(['4 октября, воскресенье','3 октября, суббота','28 сентября, понедельник','27 сентября, воскресенье','31 августа, понедельник']);
  expect(groups.flatMap(g=>g.chats.map(c=>c.id))).toEqual(['today','yesterday','week','older','august']);
  expect(JSON.stringify(chats)).toBe(before);
 });
 it('distinguishes dates from different years and omits empty groups',()=>{
  const groups=groupChats([{updatedAt:new Date(2025,9,1).getTime()},{updatedAt:new Date(2026,7,1).getTime()}],new Date(2026,9,4));
  expect(groups).toHaveLength(2);
  expect(groups[0].label).toBe('1 августа, суббота');
  expect(groups[1].label).toContain('2025');
 });
});
