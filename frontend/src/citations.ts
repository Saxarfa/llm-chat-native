import {safeUrl} from './domain';
import {isMathElement} from './markdownMath';
import type {Message} from './types';
export const sourceUrl=(source:NonNullable<Message['sources']>[number])=>source.kind==='knowledge'&&/^[a-f0-9-]{36}$/.test(source.chunk_id||'')?'/api/knowledge/chunks/'+source.chunk_id:safeUrl(source.url);

// Only link citation numbers for which this answer has a real source.
export function sourceCitations(sources:Message['sources']){
 return ()=> (tree:any)=>{
  const walk=(node:any)=>{
   if(['a','code','pre'].includes(node.tagName)||!node.children||isMathElement(node))return;
   node.children=node.children.flatMap((child:any)=>{
    if(child.type!=='text'){walk(child);return [child]}
    const result:any[]=[];let at=0;
    const text=(value:string,offset:number)=>({type:'text',value,...(child.position?.start?.offset!=null?{position:{start:{...child.position.start,offset:child.position.start.offset+offset}}}:{})});
    for(const match of child.value.matchAll(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g)){
     const numbers=match[1].split(/\s*[,;]\s*/).map(Number);
     if(!numbers.some((n:number)=>sources?.[n-1]&&sourceUrl(sources[n-1])))continue;
     if(match.index>at)result.push(text(child.value.slice(at,match.index),at));
     const known=[...new Set<number>(numbers)].filter(number=>sources?.[number-1]&&sourceUrl(sources[number-1]));
     const first=sources![known[0]-1];
     result.push({type:'element',tagName:'a',properties:{href:sourceUrl(first),className:['source-citation'],title:known.map(number=>sources![number-1].title||sources![number-1].url).join(' · '),'data-source-index':known[0]-1,'data-source-indices':known.map(number=>number-1).join(',')},children:[{type:'text',value:`[${known.join(', ')}]`}]});
     for(const number of numbers)if(!known.includes(number))result.push(text(`[${number}]`,match.index));
     at=match.index+match[0].length;
    }
    if(!at)return [child];
    if(at<child.value.length)result.push(text(child.value.slice(at),at));
    return result;
   });
  };walk(tree);
 };
}
