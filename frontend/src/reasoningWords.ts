export type ReasoningWord={text:string;start:number};

// Only the final word/whitespace run can grow during an append-only stream.
// Keep offsets so rendering the settled prefix needs one slice, not another
// full-text tokenization and join for every incoming chunk.
export class ReasoningWords{
 private source='';
 private parts:ReasoningWord[]=[];
 update(text:string):readonly ReasoningWord[]{
  if(text===this.source)return this.parts;
  if(!text.startsWith(this.source))this.parts=[];
  const start=this.parts.at(-1)?.start??0;
  if(this.parts.length)this.parts.pop();
  for(const match of text.slice(start).matchAll(/\s+|\S+/gu)){
   this.parts.push({text:match[0],start:start+match.index});
  }
  this.source=text;
  return this.parts;
 }
}
