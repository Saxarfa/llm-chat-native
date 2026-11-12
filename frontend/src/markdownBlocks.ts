import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

type Node={type:string;children?:Node[];position?:{start:{offset?:number}}};
export type MarkdownBlock={start:number;text:string};
const parser=unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const needsDocument=(node:Node):boolean=>node.type==='definition'||node.type==='footnoteDefinition'||!!node.children?.some(needsDocument);

// Only the last top-level Markdown node can still grow during append-only SSE.
// Use the real parser's boundaries so lists, tables, math and open fences stay
// together. References/footnotes need document-wide resolution, so retain the
// full-document path as soon as a definition appears (including nested ones).
export class MarkdownBlocks{
 private source='';
 private stable:MarkdownBlock[]=[];
 private tailStart=0;
 private document=false;
 private blocks:MarkdownBlock[]=[];
 update(text:string):MarkdownBlock[]{
  if(text===this.source)return this.blocks;
  if(!text.startsWith(this.source)){
   this.stable=[];this.tailStart=0;this.document=false;
  }
  this.source=text;
  if(this.document)return this.blocks=[{start:0,text}];
  const root=parser.parse(text.slice(this.tailStart)) as Node;
  if(needsDocument(root)){
   this.document=true;this.stable=[];this.tailStart=0;
   return this.blocks=[{start:0,text}];
  }
  const nodes=root.children||[],base=this.tailStart;
  for(let i=0;i<nodes.length-1;i++){
   const end=base+nodes[i+1].position!.start.offset!;
   this.stable.push({start:this.tailStart,text:text.slice(this.tailStart,end)});
   this.tailStart=end;
  }
  return this.blocks=nodes.length?[...this.stable,{start:this.tailStart,text:text.slice(this.tailStart)}]:[...this.stable];
 }
}
