import {expect,it} from 'vitest';
import {captureReadingPosition,createReadingPositions,resolveReadingAnchor,type ReadingPosition} from './readingPositions';
import type {Message} from './types';
const position=(id:string,at=1):ReadingPosition=>({anchorId:id,index:1,offset:-8,atBottom:false,at});
const fixture=()=>{const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value)},values}};
it('isolates account/tab storage and never persists temporary conversations or content',()=>{
 const storage=fixture(),a=createReadingPositions(()=>storage,'a'),b=createReadingPositions(()=>storage,'b');
 a.save('chat','main',position('m'));a.save('temp','main',position('t'),true);
 expect(a.get('temp')?.anchorId).toBe('t');expect(b.get('chat')).toBeUndefined();
 const reloaded=createReadingPositions(()=>storage,'a');expect(reloaded.get('chat')).toEqual(position('m'));expect(reloaded.get('temp')).toBeUndefined();
 expect(JSON.parse(storage.getItem('a')!).entries).toHaveLength(1);
});
it('bounds bookmarks, survives blocked/corrupt storage and keeps branches separate',()=>{
 const storage=fixture(),bookmarks=createReadingPositions(()=>storage,'a',2);
 bookmarks.save('a','main',position('a',1));bookmarks.save('a','branch',position('b',2));bookmarks.save('c','main',position('c',3));
 expect(bookmarks.get('a')).toBeUndefined();expect(bookmarks.get('a','branch')?.anchorId).toBe('b');
 const blocked=createReadingPositions(()=>{throw new Error('blocked')},'b');blocked.save('a','main',position('x'));expect(blocked.get('a')?.anchorId).toBe('x');
 storage.setItem('bad','{');expect(createReadingPositions(()=>storage,'bad').get('a')).toBeUndefined();
});
it('restores the stable anchor, nearby surviving message, and first-visit bottom policy',()=>{
 const messages=['a','b','c'].map(id=>({id,role:'user',content:'private text'}) as Message);
 expect(resolveReadingAnchor(position('b'),messages)).toBe('b');
 expect(resolveReadingAnchor({...position('gone'),afterId:'c',beforeId:'a'},messages)).toBe('c');
 expect(resolveReadingAnchor({...position('b'),atBottom:true},messages)).toBeUndefined();
 expect(resolveReadingAnchor(undefined,messages)).toBeUndefined();
});
const area=(rows:{id:string;top:number;bottom:number}[],scrollTop=0)=>({
 getBoundingClientRect:()=>({top:0,bottom:600}),scrollHeight:5000,clientHeight:600,scrollTop,
 querySelectorAll:()=>rows.map(row=>({dataset:{messageId:row.id},getBoundingClientRect:()=>({top:row.top,bottom:row.bottom})})),
}) as unknown as HTMLElement;
it('never bookmarks the streaming reply as message zero',()=>{
 const messages=['a','b','c','d'].map(id=>({id,role:'user',content:'x'}) as Message);
 const reading=captureReadingPosition(area([{id:'live',top:-300,bottom:900}],1000),messages,false)!;
 expect(reading.atBottom).toBe(true);expect(reading.anchorId).toBe('d');expect(resolveReadingAnchor(reading,messages)).toBeUndefined();
 const mixed=captureReadingPosition(area([{id:'zzz',top:-50,bottom:80},{id:'c',top:80,bottom:400}],1000),messages,false)!;
 expect(mixed.anchorId).toBe('c');expect(mixed.index).toBe(2);expect(mixed.afterId).toBe('d');
 expect(captureReadingPosition(area([{id:'a',top:-900,bottom:-800}]),messages)).toBeUndefined();
});
