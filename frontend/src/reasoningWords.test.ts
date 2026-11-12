import {describe,expect,it} from 'vitest';
import {ReasoningWords} from './reasoningWords';

describe('incremental reasoning words',()=>{
 const expected=(text:string)=>[...text.matchAll(/\s+|\S+/gu)].map(match=>({text:match[0],start:match.index}));
 it('preserves exact text, offsets and boundaries at every stream split',()=>{
  const samples=['Думаю над ответом…\n\nСледующий шаг.','  leading\tspaces\r\nnext   ','中文🙂\u0301 тест 👩‍💻\nконец','oneVeryLongWordWithoutSpaces'];
  for(const text of samples){
   const words=new ReasoningWords();
   for(let end=0;end<=text.length;end++){
    const source=text.slice(0,end),parts=words.update(source);
    expect(parts).toEqual(expected(source));
    for(const first of [0,1,Math.max(0,parts.length-3),parts.length]){
     const prefix=source.slice(0,parts[first]?.start??source.length);
     expect(prefix+parts.slice(first).map(part=>part.text).join('')).toBe(source);
    }
   }
  }
 });
 it('reuses settled tokens and reparses only the mutable tail',()=>{
  const words=new ReasoningWords(),first=[...words.update('first word\nnext')];
  const next=words.update('first word\nnextPart ');
  expect(next.slice(0,4)).toEqual(first.slice(0,4));
  next.slice(0,4).forEach((part,index)=>expect(part).toBe(first[index]));
  expect(next[4]).toEqual({text:'nextPart',start:11});
  expect(words.update('first word\nnextPart ')).toBe(next);
 });
 it('resets for edited, truncated and empty reasoning without keeping stale offsets',()=>{
  const words=new ReasoningWords();
  for(const source of ['old reasoning with many words','new response','new','', ' fresh\ntext']){
   expect(words.update(source)).toEqual(expected(source));
  }
 });
});
