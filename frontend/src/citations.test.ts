import {it,expect} from 'vitest';
import {sourceCitations} from './citations';
import {streamReveal} from './streamReveal';
const sources=[{url:'https://example.com/article',title:'Источник'}];
it('links known citations and leaves missing sources alone',()=>{
 const tree:any={children:[{type:'text',value:'Факт [1], ещё [2].'}]};
 sourceCitations(sources)()(tree);
 expect(tree.children[1].properties.href).toBe(sources[0].url);
 expect(tree.children[1].children[0].value).toBe('[1]');
 expect(tree.children[2].value).toBe(', ещё [2].');
});
it('does not turn code or existing links into citations',()=>{
 const tree:any={children:['code','pre','a'].map(tagName=>({type:'element',tagName,children:[{type:'text',value:'[1]'}]}))};
 sourceCitations(sources)()(tree);
 expect(tree.children.every((node:any)=>node.children[0].type==='text')).toBe(true);
});
it('rejects unsafe source URLs',()=>{
 const tree:any={children:[{type:'text',value:'[1]'}]};
 sourceCitations([{url:'javascript:alert(1)'}])()(tree);
 expect(tree.children[0].type).toBe('text');
});
it('keeps grouped citations in one trigger without losing unknown numbers',()=>{
 const list=Array.from({length:4},(_,i)=>({url:`https://example.com/${i+1}`}));
 const tree:any={children:[{type:'text',value:'Факт [2, 4], ещё [1; 99].'}]};
 sourceCitations(list)()(tree);
 const links=tree.children.filter((n:any)=>n.tagName==='a');
 expect(links.map((n:any)=>n.properties['data-source-indices'])).toEqual(['1,3','0']);
 expect(links[0].children[0].value).toBe('[2, 4]');
 expect(tree.children.some((n:any)=>n.value==='[99]')).toBe(true);
});
it('keeps grouped citations available during animated streaming',()=>{
 const list=Array.from({length:4},(_,i)=>({url:`https://example.com/${i+1}`}));
 const text='Факт [2, 4] продолжение',tree:any={children:[{type:'text',value:text,position:{start:{offset:0}}}]};
 sourceCitations(list)()(tree);
 const state={seenLength:0,births:new Map<number,number>()};
 streamReveal(state,text.length,0)()(tree);
 expect(tree.children.filter((n:any)=>n.tagName==='a').length).toBe(1);
 expect(state.births.has(text.indexOf('продолжение'))).toBe(true);
});
