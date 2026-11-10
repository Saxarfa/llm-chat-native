import {expect,it} from 'vitest';
import {advanceAnswer,advanceWordAnswer,answerWordEnd} from './useSmoothAnswer';
import {safeStreamEnd} from './domain';

it('reveals a burst smoothly and drains the complete answer without a long tail',()=>{
 let position=advanceAnswer(0,5000,16);
 expect(position).toBeGreaterThan(50);
 expect(position).toBeLessThan(100);
 for(let elapsed=16;elapsed<9000;elapsed+=16)position=advanceAnswer(position,5000,16);
 expect(position).toBe(5000);
});
it('keeps forward progress when new chunks arrive and avoids jumping after an inactive frame',()=>{
 const first=advanceAnswer(0,500,32);
 const second=advanceAnswer(first,1500,32);
 expect(second).toBeGreaterThan(first);
 expect(second-first).toBeLessThan(180);
 expect(advanceAnswer(second,1500,5000)-second).toBeLessThan(251);
 expect(advanceAnswer(1500,1500,16)).toBe(1500);
});
it('catches up to a short answer within a few animation frames',()=>{
 let position=0;
 for(let frame=0;frame<8&&position<200;frame++)position=advanceAnswer(position,200,32);
 expect(position).toBe(200);
});
it('never displays half of an emoji at the reveal boundary',()=>{
 const text='А🌟Б';
 expect(text.slice(0,safeStreamEnd(text,2))).toBe('А🌟');
});

it('eases into a large subscription burst while keeping the initial reveal responsive',()=>{
 const first=advanceWordAnswer(0,650,12000,16);
 expect(first.position).toBeGreaterThan(0);
 expect(first.position).toBeLessThan(25);
 expect(first.speed).toBeGreaterThan(900);
 const second=advanceWordAnswer(first.position,first.speed,24000,16);
 expect(second.speed-first.speed).toBeLessThan(600);
 expect(second.position-first.position).toBeLessThan(30);
});

it('drains a complete subscription answer and preserves pacing across an inactive frame',()=>{
 let state={position:0,speed:140};
 for(let time=0;time<9000;time+=16)state=advanceWordAnswer(state.position,state.speed,5000,16);
 expect(state.position).toBe(5000);
 const before=advanceWordAnswer(0,650,20000,16);
 const after=advanceWordAnswer(before.position,before.speed,20000,5000);
 expect(after.position-before.position).toBeLessThan(100);
});

it('publishes whole buffered words and always drains punctuation, whitespace and emoji',()=>{
 const text='Привет мир 🌟!\n';
 expect(text.slice(0,answerWordEnd(text,3))).toBe('');
 expect(text.slice(0,answerWordEnd(text,9,7))).toBe('Привет ');
 expect(text.slice(0,answerWordEnd(text,10,7))).toBe('Привет мир');
 expect(answerWordEnd(text,text.length,7)).toBe(text.length);
 const emoji='А🌟Б';
 expect(emoji.slice(0,answerWordEnd(emoji,emoji.length))).toBe(emoji);
});

it('keeps long URLs and languages without spaces moving without cutting surrogate pairs',()=>{
 const text='界'.repeat(47)+'🌟'+'界'.repeat(100);
 const end=answerWordEnd(text,48);
 expect(end).toBe(49);
 expect(text.slice(0,end)).toBe('界'.repeat(47)+'🌟');
 expect(answerWordEnd(text,80,end)).toBe(end);
 expect(answerWordEnd(text,100,end)).toBe(100);
});
