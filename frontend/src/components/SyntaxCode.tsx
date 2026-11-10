import {memo,useEffect,useRef,useState} from 'react';
import {syntaxHighlighter} from '../syntaxHighlight';

type Highlight={code:string;language:string;chunks:string[]};
const HighlightedPrefix=memo(function HighlightedPrefix({html}:{html:string}){
 return <span dangerouslySetInnerHTML={{__html:html}}/>;
});

export function SyntaxCode({className,children,node,...props}:any){
 const code=String(children).replace(/\n$/,''),language=/language-(\S+)/.exec(className||'')?.[1];
 const block=!!language||code.includes('\n');
 const [highlight,setHighlight]=useState<Highlight>();
 const latest=useRef({code,language,block}),alive=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>(undefined),client=useRef({});
 latest.current={code,language,block};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);timer.current=undefined;syntaxHighlighter.cancel(client.current)}},[]);
 useEffect(()=>{
  if(!block||!language||timer.current!==undefined)return;
  // Throttle instead of restarting a debounce on every token. Keep the last
  // coloured prefix visible while the new suffix waits for highlighting.
  timer.current=setTimeout(()=>{
   timer.current=undefined;
   const target=latest.current;
   if(!alive.current||!target.language)return;
   syntaxHighlighter.request(client.current,target.code,target.language,chunks=>{
    if(!alive.current||latest.current.language!==target.language||!latest.current.code.startsWith(target.code))return;
    setHighlight(previous=>previous&&previous.language===target.language&&previous.code.length>target.code.length&&latest.current.code.startsWith(previous.code)?previous:{code:target.code,language:target.language!,chunks});
   });
  },70);
 },[code,language,block]);
 if(!block)return <code {...props} className={className}>{children}</code>;
 const prefix=highlight&&highlight.language===language&&code.startsWith(highlight.code)?highlight:undefined;
 // Updating an uncoloured suffix must not rebuild thousands of existing token
 // spans. React updates only this text node until the worker finishes a snapshot.
 return <code className={className}>{prefix?<>{prefix.chunks.map((html,index)=><HighlightedPrefix key={index} html={html}/>)}{code.slice(prefix.code.length)}</>:code}</code>;
}
