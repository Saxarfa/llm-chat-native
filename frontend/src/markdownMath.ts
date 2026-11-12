import {unified,type Processor} from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';

type Element={tagName?:string;properties?:Record<string,unknown>;children?:Element[];position?:{start:{offset?:number};end?:{offset?:number}}};
type MarkdownNode={type?:string;value?:string;children?:MarkdownNode[];data?:{hChildren?:MarkdownNode[]};position?:Element['position']};
const mathParser=unified().use(remarkParse).use(remarkMath);
const proseParser=unified().use(remarkParse);

// A currency dollar must not pair with the next price elsewhere in a paragraph.
// Inspect prose only, leaving code and link destinations untouched. Explicit
// numeric math ($2$, $2 + 2$, $2x$, $2 \\pi$) retains its normal delimiters.
function currencyDollars(source:string){
 const offsets:number[]=[];
 const visit=(node:MarkdownNode)=>{
  const start=node.position?.start.offset,end=node.position?.end?.offset;
  if(node.type==='text'&&start!=null&&end!=null){
   const text=source.slice(start,end);
   for(const match of text.matchAll(/\$(?=\d)/g)){
    const offset=start+match.index!;
    if(source[offset-1]==='$'||source[offset-1]==='\\')continue;
    const amount=source.slice(offset+1).match(/^\d+(?:[.,]\d+)*(?:[–—-]\d+(?:[.,]\d+)*)?/)!;
    const suffix=source.slice(offset+1+amount[0].length).trimStart();
    if(suffix.startsWith('$')||/^[+=^_/{\\<>-]/.test(suffix)||/^\*(?!\*)\s*[\dA-Za-z\\({]/.test(suffix)||/^[a-zA-Z](?=[\s$^_+*=/])/.test(suffix))continue;
    offsets.push(offset);
   }
  }
  node.children?.forEach(visit);
 };
 visit(proseParser.parse(source) as unknown as MarkdownNode);
 return offsets;
}

// GFM splits table cells before inline math is parsed. Protect pipes in complete
// TeX spans during that split, then restore the exact TeX before KaTeX runs.
// A one-code-unit marker preserves source offsets for citations and animations.
// The standard math parser handles escapes and code fences/spans for us.
export function tableMathPipes(this:Processor){
 const parse=this.parser;
 if(!parse)return;
 this.parser=(source,file)=>{
  if(!source.includes('$'))return parse(source,file);
  const currency=currencyDollars(source);
  let code=0xe000;
  const used=new Set(source);
  while(code<=0xf8fe&&(used.has(String.fromCharCode(code))||used.has(String.fromCharCode(code+1))))code++;
  if(code>0xf8fe)return parse(source,file);
  const marker=String.fromCharCode(code),dollar=String.fromCharCode(code+1),chars=source.split('');
  for(const offset of currency)chars[offset]=dollar;
  const protectedSource=chars.join('');
  const ranges:Array<[number,number]>=[];
  const find=(node:MarkdownNode)=>{
   const start=node.position?.start.offset,end=node.position?.end?.offset;
   if(node.type==='inlineMath'&&node.value?.includes('|')&&!node.value.includes('\n')&&start!=null&&end!=null&&!/\d/.test(source[end]||''))ranges.push([start,end]);
   node.children?.forEach(find);
  };
  if(source.includes('|'))find(mathParser.parse(protectedSource) as unknown as MarkdownNode);
  if(!ranges.length&&!currency.length)return parse(source,file);
  for(const [start,end] of ranges)for(let i=start;i<end;i++)if(chars[i]==='|')chars[i]=marker;
  const tree=parse(chars.join(''),file);
  const restore=(node:MarkdownNode)=>{
   if(node.value)node.value=node.value.replaceAll(marker,'|').replaceAll(dollar,'$');
   node.children?.forEach(restore);node.data?.hChildren?.forEach(restore);
  };
  restore(tree);
  return tree;
 };
}

// Math layout must stay intact: citations, search marks and word animations
// should only transform ordinary prose, never KaTeX's HTML or MathML.
export function isMathElement(node:Element){
 const classes=node.properties?.className;
 return node.tagName==='math'||Array.isArray(classes)&&classes.some(name=>['katex','katex-display','math-inline','math-display','language-math'].includes(String(name)));
}

// Models also emit a complete $$...$$ equation on a single line. remark-math
// parses that as inline math; display it as a block when it is the whole paragraph.
export function standaloneMath(){
 return (tree:Element,file:{value?:unknown})=>{
  const source=String(file.value??'');
  const visit=(node:Element)=>{
   if(node.tagName==='p'&&node.children?.length===1){
    const math=node.children[0],classes=math.properties?.className;
    const start=node.position?.start.offset,end=node.position?.end?.offset;
    if(Array.isArray(classes)&&classes.includes('math-inline')&&start!=null&&end!=null&&/^\s*\$\$[\s\S]*\$\$\s*$/.test(source.slice(start,end))){
     math.properties={...math.properties,className:classes.map(name=>name==='math-inline'?'math-display':name)};
    }
   }
   if(isMathElement(node)||node.tagName==='pre'||node.tagName==='code')return;
   node.children?.forEach(visit);
  };
  visit(tree);
 };
}
