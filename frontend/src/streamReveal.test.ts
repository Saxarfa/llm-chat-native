import {it,expect} from 'vitest';
import {streamReveal} from './streamReveal';
const text=(value:string,offset=0)=>({type:'text',value,position:{start:{offset}}});
it('reveals appended words without replaying settled words',()=>{
 const state={seenLength:6,births:new Map<number,number>()};
 const tree={type:'root',children:[text('Hello world')]};
 streamReveal(state,11,100)()(tree);
 expect(tree.children[0]).toEqual({type:'text',value:'Hello '});
 expect(tree.children[1]).toMatchObject({tagName:'span',children:[{value:'world'}]});
 const later={type:'root',children:[text('Hello world again')]};
 streamReveal(state,17,300)()(later);
 expect(later.children[0]).toEqual({type:'text',value:'Hello world '});
 expect(later.children[1]).toMatchObject({tagName:'span',children:[{value:'again'}]});
});
it('keeps a partial word on the same reveal timeline',()=>{
 const state={seenLength:0,births:new Map<number,number>()};
 streamReveal(state,3,100)()({type:'root',children:[text('Прив')]});
 const next={type:'root',children:[text('Привет')]};
 streamReveal(state,6,170)()(next);
 expect(next.children[0]).toMatchObject({properties:{'data-reveal-born':100,'data-reveal-offset':0},children:[{value:'Привет'}]});
});
it('preserves link structure and leaves code untouched',()=>{
 const code={type:'element',tagName:'code',children:[text('print("hello")',20)]};
 const tree={type:'root',children:[{type:'element',tagName:'a',properties:{href:'https://example.com'},children:[text('Источник',1)]},code]};
 streamReveal({seenLength:0,births:new Map()},35,100)()(tree);
 expect(tree.children[0]).toMatchObject({tagName:'a',properties:{href:'https://example.com'},children:[{tagName:'span'}]});
 expect(tree.children[1]).toEqual(code);
 expect(code.children[0].type).toBe('text');
});
