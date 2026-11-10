import {isMathElement} from './markdownMath';
type Node={type:string;tagName?:string;value?:string;children?:Node[];properties?:Record<string,unknown>;position?:{start:{offset?:number}}};
export type RevealState={seenLength:number;births:Map<number,number>};
// Transform parsed text, never Markdown source or code. Source offsets keep a word's
// reveal age stable when the parser closes a link, emphasis, or another inline tag.
export function streamReveal(state:RevealState,textLength:number,now:number){
 return ()=> (tree:Node)=>{
  for(const[offset,born]of state.births)if(now-born>=180)state.births.delete(offset);
  const visit=(parent:Node)=>{
   if(!parent.children||parent.tagName==='pre'||parent.tagName==='code'||isMathElement(parent))return;
   parent.children=parent.children.flatMap(node=>{
    if(node.type!=='text'){visit(node);return[node]}
    const start=node.position?.start.offset;if(start==null||!node.value)return[node];
    const result:Node[]=[];let settled='';
    for(const match of node.value.matchAll(/\s+|\S+/gu)){
     const word=match[0],offset=start+match.index;
     let born=state.births.get(offset);
     if(born==null&&offset>=state.seenLength&&!/^\s+$/u.test(word)){born=now;state.births.set(offset,born)}
     if(born==null||now-born>=180){settled+=word;continue}
     if(settled){result.push({type:'text',value:settled});settled=''}
     result.push({type:'element',tagName:'span',properties:{className:['answer-word-enter'],'data-reveal-born':born,'data-reveal-offset':offset},children:[{type:'text',value:word}]});
    }
    if(settled)result.push({type:'text',value:settled});
    return result;
   });
  };
  visit(tree);state.seenLength=textLength;
 };
}
