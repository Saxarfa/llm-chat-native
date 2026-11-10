import {expect,it} from 'vitest';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {MarkdownBlocks} from './markdownBlocks';
const parser=unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const clean=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,item)=>key==='position'?undefined:item));

it('matches full-document Markdown for every streamed prefix, including open constructs',()=>{
 const documents=[
  '# Heading\n\nParagraph **bold** and 🌟.\n\n- first\n\n  nested paragraph\n  - child\n\n- second\n\nEnd\n',
  '| A | B |\n|---|---|\n| 1 | 2 |\n\n```python\nvalue = "a\\nb"\n\nprint(value)\n```\n\nTail',
  'Text $x^2$.\n\n$$\n\\frac{a}{b}\n$$\n\n> Quote\n>\n> More\n\nTitle\n-----\n\n    indented code\n\nEnd',
  'A [reference][source] and note[^1].\n\nParagraph.\n\n[source]: https://example.com\n\n[^1]: Footnote\n',
  '- List [reference][ref]\n\n  [ref]: https://example.com\n\nEnd',
 ];
 for(const document of documents){
  const cache=new MarkdownBlocks();
  for(let end=1;end<=document.length;end++){
   const text=document.slice(0,end),parts=cache.update(text);
   expect(clean(parts.flatMap(part=>parser.parse(part.text).children))).toEqual(clean(parser.parse(text).children));
  }
 }
});

it('reuses settled blocks but resolves late reference definitions across the document',()=>{
 const cache=new MarkdownBlocks();
 const first=cache.update('Ready paragraph.\n\nGrowing');
 expect(cache.update('Ready paragraph.\n\nGrowing tail')[0]).toBe(first[0]);
 const referenced='Ready [link][id].\n\nTail\n\n[id]: https://example.com';
 expect(cache.update(referenced)).toEqual([{start:0,text:referenced}]);
 const edited='Completely replaced **answer**.';
 expect(cache.update(edited)).toEqual([{start:0,text:edited}]);
});
