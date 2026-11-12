// Highlight.js emits escaped text and nested span tags. Balance spans at fixed
// line boundaries so React can retain unchanged coloured regions while a later
// region grows. Multiline comments/strings keep the same inherited token style.
export function highlightChunks(html:string,linesPerChunk=64){
 const chunks:string[]=[],open:string[]=[];
 let chunk='',cursor=0,lines=0,hasText=false;
 for(const match of html.matchAll(/<\/?span\b[^>]*>|\n/g)){
  const text=html.slice(cursor,match.index),token=match[0];
  chunk+=text+token;hasText||=!!text;cursor=match.index+token.length;
  if(token==='\n'){
   hasText=true;
   if(++lines%linesPerChunk===0){
    chunks.push(chunk+'</span>'.repeat(open.length));chunk=open.join('');hasText=false;
   }
  }else if(token.startsWith('</'))open.pop();else open.push(token);
 }
 const tail=html.slice(cursor);chunk+=tail;hasText||=!!tail;
 if(hasText)chunks.push(chunk);
 return chunks;
}
