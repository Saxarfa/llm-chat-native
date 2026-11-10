import {describe,it,expect} from 'vitest';
import {matchParts,highlightSearch} from './chatSearch';
describe('saved chat search highlighting',()=>{
 it('matches literal punctuation, case and ё without interpreting HTML or regex',()=>{
  expect(matchParts('Ёжик [50%_x] и ещё ёжик','ежик').filter(p=>p.match).map(p=>p.text)).toEqual(['Ёжик','ёжик']);
  expect(matchParts('text [.*] <script>','[.*]').find(p=>p.match)?.text).toBe('[.*]');
 });
 it('preserves text and does not mark code blocks or existing marks',()=>{
  const tree:any={type:'root',children:[{type:'element',tagName:'p',children:[{type:'text',value:'Кот и кот'}]},{type:'element',tagName:'code',children:[{type:'text',value:'кот'}]}]};
  highlightSearch('кот')()(tree);
  expect(tree.children[0].children.filter((n:any)=>n.tagName==='mark')).toHaveLength(2);
  expect(tree.children[0].children.map((n:any)=>n.value||n.children?.[0].value).join('')).toBe('Кот и кот');
  expect(tree.children[1].children[0].type).toBe('text');
 });
});
