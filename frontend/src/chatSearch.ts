import {createContext} from 'react';
import {isMathElement} from './markdownMath';
export const SearchHighlightContext=createContext('');
export type SearchResult={chat_id:string;title:string;branch_id:string;branch_name?:string;message_id:string|null;role:string;snippet:string};
export type SearchTarget={chatId:string;messageId:string;query:string;nonce:number};
export function matchParts(text:string,query:string):{text:string;match:boolean}[]{
 const normalize=(v:string)=>v.toLocaleLowerCase().replaceAll('ё','е'),needle=normalize(query.trim()),haystack=normalize(text);
 if(!needle)return [{text,match:false}];
 const result:{text:string;match:boolean}[]=[];let cursor=0,index=haystack.indexOf(needle);
 while(index>=0){if(index>cursor)result.push({text:text.slice(cursor,index),match:false});result.push({text:text.slice(index,index+needle.length),match:true});cursor=index+needle.length;index=haystack.indexOf(needle,cursor)}
 if(cursor<text.length)result.push({text:text.slice(cursor),match:false});return result;
}
export function highlightSearch(query:string){return()=> (tree:any)=>{
 if(!query.trim())return;
 const walk=(node:any)=>{if(!node.children||['code','pre','mark','script','style'].includes(node.tagName)||isMathElement(node))return;node.children=node.children.flatMap((child:any)=>{if(child.type==='text')return matchParts(child.value,query).map(p=>p.match?{type:'element',tagName:'mark',properties:{className:['search-highlight']},children:[{type:'text',value:p.text}]}:{type:'text',value:p.text});walk(child);return [child]})};walk(tree);
};}
