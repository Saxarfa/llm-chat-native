import hljs from 'highlight.js/lib/common';
import type {HighlightRequest,HighlightResponse} from './syntaxHighlight';
import {highlightChunks} from './highlightChunks';

self.onmessage=(event:MessageEvent<HighlightRequest>)=>{
 const {id,code,language}=event.data;
 let chunks:string[]|null=null;
 try{if(hljs.getLanguage(language))chunks=highlightChunks(hljs.highlight(code,{language}).value)}catch{}
 self.postMessage({id,chunks} satisfies HighlightResponse);
};
